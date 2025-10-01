import { NativeImage, WebContentsView } from "electron";
import type { ActivityCollector } from "./ActivityCollector";
import type { ContentAnalyzer } from "./ContentAnalyzer";

export type HistoryCallback = (entry: {
  url: string;
  title: string;
  visitedAt: Date;
  favicon?: string;
}) => void;

export class Tab {
  private webContentsView: WebContentsView;
  private _id: string;
  private _title: string;
  private _url: string;
  private _isVisible: boolean = false;
  private _sessionPartition: string;
  private historyCallback?: HistoryCallback;
  private activityCollector?: ActivityCollector;
  private contentAnalyzer?: ContentAnalyzer;
  private loadStartTime: number = 0;
  private lastFocusTime: number = 0;
  private lastBlurTime: number = 0;
  private scriptInjected: boolean = false;
  private hasAnalyzedThisPage: boolean = false;
  private pageInteractionData: {
    clickCount: number;
    keyboardEvents: number;
    focusEvents: number;
    scrollDepth: number;
    startTime: number;
  } = {
    clickCount: 0,
    keyboardEvents: 0,
    focusEvents: 0,
    scrollDepth: 0,
    startTime: 0
  };

  constructor(
    id: string, 
    url: string = "https://www.google.com", 
    sessionPartition: string = "default",
    historyCallback?: HistoryCallback
  ) {
    this._id = id;
    this._url = url;
    this._title = "New Tab";
    this._sessionPartition = sessionPartition;
    this.historyCallback = historyCallback;

    // Create the WebContentsView for web content with user-specific session partition
    this.webContentsView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        partition: sessionPartition,
      },
    });

    // Set up event listeners
    this.setupEventListeners();

    // Load the initial URL
    this.loadURL(url);
  }

  private setupEventListeners(): void {
    const webContents = this.webContentsView.webContents;

    // Update title when page title changes
    webContents.on("page-title-updated", (_, title) => {
      this._title = title;
      // Update history with new title if we have a callback
      this.recordHistoryEntry();
    });

    // Track navigation start
    webContents.on("did-start-navigation", (_, url) => {
      this.loadStartTime = Date.now();
      
      // Record page interaction data for previous page before navigating
      if (this._url && this._url !== url && this.activityCollector) {
        this.recordPageInteraction('navigation');
      }
    });

    // Update URL when navigation occurs
    webContents.on("did-navigate", (_, url) => {
      const previousUrl = this._url;
      this._url = url;
      console.log(`Tab.did-navigate: ${previousUrl} → ${url}, visible=${this._isVisible}`);
      this.recordHistoryEntry();
      
      // Track navigation event
      if (this.activityCollector && previousUrl && previousUrl !== url) {
        this.activityCollector.collectNavigationEvent({
          fromUrl: previousUrl,
          toUrl: url,
          method: 'click', // Could be enhanced to detect actual method, eg from browser history
          loadTime: Date.now() - this.loadStartTime
        });
      }
      
      // Reset page interaction data for new page
      this.resetPageInteractionData();
      
      // Reset script injection flag for new page
      this.scriptInjected = false;
      
      // Reset content analysis flag for new page
      console.log(`Tab.did-navigate: Resetting hasAnalyzedThisPage flag for ${url}`);
      this.hasAnalyzedThisPage = false;
    });

    webContents.on("did-navigate-in-page", (_, url) => {
      this._url = url;
      this.recordHistoryEntry();
      
      // Reset content analysis flag for in-page navigation (e.g., SPAs, hash changes)
      this.hasAnalyzedThisPage = false;
    });

    // Track successful page loads
    webContents.on("did-finish-load", () => {
      console.log(`Tab.did-finish-load: URL=${this._url}, visible=${this._isVisible}`);
      this.recordHistoryEntry();
      
      // Track page visit
      if (this.activityCollector) {
        this.activityCollector.collectPageVisit({
          url: this._url,
          title: this._title,
          favicon: this.getFaviconSync(),
          loadTime: Date.now() - this.loadStartTime,
          userAgent: webContents.getUserAgent()
        });
      }
      
      // Inject activity tracking script only once per page
      if (!this.scriptInjected) {
        this.injectActivityTrackingScript();
        this.scriptInjected = true;
      }

      // Trigger content analysis if tab is currently visible
      console.log(`Tab.did-finish-load: Checking if should trigger analysis, visible=${this._isVisible}`);
      if (this._isVisible) {
        this.triggerContentAnalysis();
      } else {
        console.log(`Tab.did-finish-load: Skipping analysis - tab not visible`);
      }
    });

    // Track focus changes
    webContents.on("focus", () => {
      this.lastFocusTime = Date.now();
      this.pageInteractionData.focusEvents++;
      
      if (this.activityCollector) {
        this.activityCollector.collectFocusChange({
          url: this._url,
          focusType: 'tab_focus',
          previousState: 'blurred',
          duration: this.lastBlurTime > 0 ? Date.now() - this.lastBlurTime : 0
        });
      }
    });

    webContents.on("blur", () => {
      this.lastBlurTime = Date.now();
      
      if (this.activityCollector) {
        this.activityCollector.collectFocusChange({
          url: this._url,
          focusType: 'tab_blur',
          previousState: 'focused',
          duration: this.lastFocusTime > 0 ? Date.now() - this.lastFocusTime : 0
        });
      }
    });
  }

  private recordHistoryEntry(): void {
    // Only record history for visible/active tabs
    if (this.historyCallback && this._url && this._isVisible && 
        !this._url.startsWith('chrome://') && !this._url.startsWith('about:')) {
      // Get favicon if available
      this.webContentsView.webContents.executeJavaScript(`
        (function() {
          const link = document.querySelector('link[rel*="icon"]');
          return link ? link.href : null;
        })();
      `).then(favicon => {
        this.historyCallback!({
          url: this._url,
          title: this._title || this._url,
          visitedAt: new Date(),
          favicon: favicon || undefined
        });
      }).catch(() => {
        // Fallback without favicon
        this.historyCallback!({
          url: this._url,
          title: this._title || this._url,
          visitedAt: new Date()
        });
      });
    }
  }

  // Getters
  get id(): string {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get url(): string {
    return this._url;
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  get webContents() {
    return this.webContentsView.webContents;
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }

  get sessionPartition(): string {
    return this._sessionPartition;
  }

  // Activity tracking methods
  setActivityCollector(collector: ActivityCollector): void {
    this.activityCollector = collector;
  }

  setContentAnalyzer(analyzer: ContentAnalyzer): void {
    this.contentAnalyzer = analyzer;
  }

  private resetPageInteractionData(): void {
    this.pageInteractionData = {
      clickCount: 0,
      keyboardEvents: 0,
      focusEvents: 0,
      scrollDepth: 0,
      startTime: Date.now()
    };
  }

  private recordPageInteraction(exitMethod: 'navigation' | 'close' | 'back' | 'new_tab' | 'switch_tab'): void {
    if (!this.activityCollector || !this._url) return;

    const timeOnPage = Date.now() - this.pageInteractionData.startTime;
    
    this.activityCollector.collectPageInteraction({
      url: this._url,
      title: this._title,
      timeOnPage,
      scrollDepth: this.pageInteractionData.scrollDepth,
      clickCount: this.pageInteractionData.clickCount,
      keyboardEvents: this.pageInteractionData.keyboardEvents,
      focusEvents: this.pageInteractionData.focusEvents,
      exitMethod
    });
  }

  private getFaviconSync(): string | undefined {
    // Simple synchronous favicon getter - could be enhanced
    try {
      return undefined; // For now, return undefined
    } catch {
      return undefined;
    }
  }

  private injectActivityTrackingScript(): void {
    if (!this.activityCollector) return;

    const script = `
      (function() {
        // Prevent multiple injections with stronger check
        if (window.__blueberryActivityTrackerInjected) {
          console.log('Blueberry activity tracker already injected, skipping');
          return;
        }
        
        // Mark as injected immediately
        window.__blueberryActivityTrackerInjected = true;

        // Track clicks
        document.addEventListener('click', (e) => {
          const data = {
            x: e.clientX,
            y: e.clientY,
            elementTag: e.target.tagName,
            elementClass: e.target.className,
            elementId: e.target.id,
            elementText: e.target.textContent ? e.target.textContent.slice(0, 100) : '',
            clickType: e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle',
            isDoubleClick: e.detail === 2
          };
          
          // Send to main process via IPC
          if (window.electronAPI && window.electronAPI.reportActivity) {
            window.electronAPI.reportActivity('click_event', data);
          }
        });

        // Track scrolling with throttling
        let scrollTimeout;
        let lastScrollTop = 0;
        document.addEventListener('scroll', () => {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(() => {
            const currentScrollTop = window.scrollY;
            const direction = currentScrollTop > lastScrollTop ? 'down' : 'up';
            const speed = Math.abs(currentScrollTop - lastScrollTop) / 100; // rough speed calculation
            
            const data = {
              scrollTop: currentScrollTop,
              scrollLeft: window.scrollX,
              viewportHeight: window.innerHeight,
              documentHeight: document.documentElement.scrollHeight,
              direction: direction,
              speed: speed
            };
            
            if (window.electronAPI && window.electronAPI.reportActivity) {
              window.electronAPI.reportActivity('scroll_event', data);
            }
            
            lastScrollTop = currentScrollTop;
          }, 100);
        });

        // Track keyboard input with throttling
        let keyboardTimeout;
        let keyCount = 0;
        let lastTarget = null;
        
        document.addEventListener('keydown', (e) => {
          keyCount++;
          lastTarget = e.target;
          
          clearTimeout(keyboardTimeout);
          keyboardTimeout = setTimeout(() => {
            if (keyCount > 0 && lastTarget) {
              const data = {
                keyCount: keyCount,
                inputType: lastTarget.type === 'search' ? 'search' : 
                          (lastTarget.tagName === 'INPUT' || lastTarget.tagName === 'TEXTAREA') ? 'form' : 'other',
                elementTag: lastTarget.tagName,
                hasShortcuts: false // Will be set per keypress
              };
              
              if (window.electronAPI && window.electronAPI.reportActivity) {
                window.electronAPI.reportActivity('keyboard_input', data);
              }
              
              keyCount = 0;
              lastTarget = null;
            }
          }, 1000);
        });

        // Track mouse movements with heavy throttling
        let mouseTimeout;
        let mouseMovements = [];
        document.addEventListener('mousemove', (e) => {
          mouseMovements.push({
            x: e.clientX,
            y: e.clientY,
            timestamp: Date.now()
          });

          // Keep only last 20 movements to avoid memory issues
          if (mouseMovements.length > 20) {
            mouseMovements = mouseMovements.slice(-20);
          }

          clearTimeout(mouseTimeout);
          mouseTimeout = setTimeout(() => {
            if (mouseMovements.length > 1) {
              // Calculate total distance and average speed
              let totalDistance = 0;
              for (let i = 1; i < mouseMovements.length; i++) {
                const dx = mouseMovements[i].x - mouseMovements[i-1].x;
                const dy = mouseMovements[i].y - mouseMovements[i-1].y;
                totalDistance += Math.sqrt(dx*dx + dy*dy);
              }
              
              const totalTime = mouseMovements[mouseMovements.length-1].timestamp - mouseMovements[0].timestamp;
              const averageSpeed = totalTime > 0 ? (totalDistance / totalTime) * 1000 : 0;
              
              const data = {
                movements: mouseMovements.slice(),
                totalDistance: totalDistance,
                averageSpeed: averageSpeed
              };
              
              if (window.electronAPI && window.electronAPI.reportActivity) {
                window.electronAPI.reportActivity('mouse_movement', data);
              }
              
              mouseMovements = [];
            }
          }, 2000); // Send every 2 seconds
        });

        // Track form interactions
        document.addEventListener('submit', (e) => {
          if (e.target.tagName === 'FORM') {
            const form = e.target;
            const inputs = form.querySelectorAll('input, textarea, select');
            let completedFields = 0;
            
            inputs.forEach(input => {
              if (input.value && input.value.trim() !== '') {
                completedFields++;
              }
            });
            
            const data = {
              formType: form.className.includes('search') ? 'search' : 
                       form.className.includes('login') ? 'login' :
                       form.className.includes('register') ? 'registration' : 'other',
              fieldsCount: inputs.length,
              completedFields: completedFields,
              submitted: true,
              timeToComplete: 0 // Could be tracked with form focus events
            };
            
            if (window.electronAPI && window.electronAPI.reportActivity) {
              window.electronAPI.reportActivity('form_interaction', data);
            }
          }
        });

        console.log('Blueberry activity tracking script injected successfully');
      })();
    `;

    this.webContentsView.webContents.executeJavaScript(script).catch(error => {
      console.error('Failed to inject activity tracking script:', error);
    });
  }

  // Handle activity reports from injected script
  handleActivityReport(activityType: string, data: any): void {
    if (!this.activityCollector) return;

    // Add URL and title context to the data
    const enrichedData = {
      ...data,
      url: this._url,
      title: this._title
    };

    // Update internal tracking data
    switch (activityType) {
      case 'click_event':
        this.pageInteractionData.clickCount++;
        this.activityCollector.collectClickEvent(enrichedData);
        break;
      case 'scroll_event':
        // Update scroll depth tracking
        const scrollPercentage = (enrichedData.scrollTop / Math.max(enrichedData.documentHeight - enrichedData.viewportHeight, 1)) * 100;
        this.pageInteractionData.scrollDepth = Math.max(this.pageInteractionData.scrollDepth, scrollPercentage);
        this.activityCollector.collectScrollEvent(enrichedData);
        break;
      case 'keyboard_input':
        this.pageInteractionData.keyboardEvents += enrichedData.keyCount;
        this.activityCollector.collectKeyboardInput(enrichedData);
        break;
      case 'mouse_movement':
        this.activityCollector.collectMouseMovement(enrichedData);
        break;
      case 'form_interaction':
        this.activityCollector.collectFormInteraction(enrichedData);
        break;
      default:
        console.warn('Unknown activity type:', activityType);
    }
  }

  // Public methods
  async show(): Promise<void> {
    this._isVisible = true;
    this.webContentsView.setVisible(true);
    this.recordHistoryEntry();

    // Trigger content analysis when tab becomes visible
    this.triggerContentAnalysis();
  }

  private triggerContentAnalysis(): void {
    console.log(`Tab.triggerContentAnalysis: URL=${this._url}, hasAnalyzed=${this.hasAnalyzedThisPage}, visible=${this._isVisible}, hasAnalyzer=${!!this.contentAnalyzer}, hasCollector=${!!this.activityCollector}`);
    
    // Trigger content analysis on first activation of this page
    if (!this.hasAnalyzedThisPage && this.contentAnalyzer && this.activityCollector) {
      this.hasAnalyzedThisPage = true;
      
      // Get current user ID from activity collector
      const userId = this.activityCollector.getUserId();
      
      // Generate activity ID for this page visit
      const activityId = `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`Tab.triggerContentAnalysis: Triggering smart cookie detection and analysis for ${this._url} with activityId ${activityId}`);
      
      // Trigger analysis with smart cookie dialog handling (async, non-blocking)
      this.handleContentAnalysisWithCookieDetection(activityId, userId).catch(error => {
        console.error('Content analysis with cookie detection failed:', error);
      });
    } else {
      console.log(`Tab.triggerContentAnalysis: Skipping analysis - already analyzed or missing dependencies`);
    }
  }

  // ============================================================================
  // COOKIE CONSENT DIALOG DETECTION & HANDLING
  // ============================================================================

  /**
   * Detects cookie consent dialogs using DOM analysis
   * Returns confidence score (0-1) and whether a dialog is likely present
   */
  private async detectCookieConsent(): Promise<{
    hasDialog: boolean;
    confidence: number;
    details?: any;
  }> {
    try {
      const result = await this.runJs(`
        (function() {
          const indicators = {
            // Common cookie consent patterns
            selectors: [
              '[id*="cookie" i][id*="banner" i]',
              '[id*="cookie" i][id*="consent" i]',
              '[class*="cookie" i][class*="banner" i]',
              '[class*="cookie" i][class*="consent" i]',
              '[class*="cookie" i][class*="modal" i]',
              '[id*="onetrust"]',
              '[id*="cookiebot"]',
              '[class*="gdpr"]',
              '[id*="gdpr"]',
              '.cmp-banner',
              '.cookie-notice',
              '#cookie-law-info-bar',
              '[role="dialog"][aria-label*="cookie" i]',
              '[role="dialog"][aria-label*="consent" i]',
              '[role="dialog"][aria-label*="privacy" i]'
            ],
            
            // Common button text (case insensitive)
            buttonTexts: [
              'accept cookies',
              'accept all cookies',
              'accept all',
              'reject cookies',
              'reject all',
              'cookie settings',
              'cookie preferences',
              'manage cookies',
              'manage preferences',
              'i agree',
              'i accept',
              'allow all',
              'only necessary',
              'only essential',
              'decline',
              'customize'
            ]
          };
          
          let score = 0;
          let foundElements = [];
          
          // Check for dialog selectors
          for (const selector of indicators.selectors) {
            try {
              const elements = document.querySelectorAll(selector);
              if (elements.length > 0) {
                for (const el of elements) {
                  // Check if element is visible and covers significant screen space
                  const rect = el.getBoundingClientRect();
                  const isVisible = rect.width > 0 && rect.height > 0;
                  const style = window.getComputedStyle(el);
                  const isDisplayed = style.display !== 'none' && 
                                     style.visibility !== 'hidden' &&
                                     parseFloat(style.opacity) > 0;
                  
                  if (isVisible && isDisplayed) {
                    score += 30;
                    
                    // High z-index indicates overlay
                    const zIndex = parseInt(style.zIndex) || 0;
                    if (zIndex > 1000) score += 20;
                    if (zIndex > 9999) score += 30; // Very high z-index
                    
                    // Fixed/absolute positioning
                    if (style.position === 'fixed') score += 15;
                    if (style.position === 'absolute') score += 10;
                    
                    // Large coverage area
                    const coverage = (rect.width * rect.height) / 
                                    (window.innerWidth * window.innerHeight);
                    if (coverage > 0.2) score += 15;
                    if (coverage > 0.5) score += 25;
                    if (coverage > 0.8) score += 35; // Near full screen coverage
                    
                    foundElements.push({
                      selector: selector,
                      zIndex: zIndex,
                      coverage: (coverage * 100).toFixed(1) + '%',
                      position: style.position,
                      dimensions: {
                        width: rect.width,
                        height: rect.height
                      }
                    });
                  }
                }
              }
            } catch (e) {
              // Ignore selector errors
            }
          }
          
          // Check for cookie-related buttons
          let buttonMatches = 0;
          const allButtons = document.querySelectorAll('button, a[role="button"], [onclick], input[type="button"]');
          for (const button of allButtons) {
            const text = (button.textContent || button.value || '').toLowerCase().trim();
            for (const buttonText of indicators.buttonTexts) {
              if (text.includes(buttonText)) {
                buttonMatches++;
                score += 10;
                break;
              }
            }
            if (buttonMatches >= 3) break; // Cap button score contribution
          }
          
          // Check for common consent management platform indicators
          const hasCMP = !!(window.OneTrust || window.Cookiebot || window.CookieConsent || 
                           window.__tcfapi || window.__cmp || window.Didomi);
          if (hasCMP) {
            score += 40;
          }
          
          // Check for backdrop/overlay elements (common in modal dialogs)
          const backdrops = document.querySelectorAll(
            '[class*="backdrop"], [class*="overlay"], [class*="mask"], [class*="curtain"]'
          );
          for (const backdrop of backdrops) {
            const style = window.getComputedStyle(backdrop);
            const rect = backdrop.getBoundingClientRect();
            if (style.position === 'fixed' && 
                parseInt(style.zIndex) > 100 &&
                rect.width > window.innerWidth * 0.8 &&
                rect.height > window.innerHeight * 0.8) {
              score += 20;
            }
          }
          
          return {
            score: Math.min(score, 100),
            foundElements: foundElements,
            hasCMP: hasCMP,
            buttonMatches: buttonMatches
          };
        })()
      `);
      
      const confidence = result.score / 100;
      return {
        hasDialog: result.score > 50, // Confidence threshold
        confidence: confidence,
        details: result
      };
    } catch (error) {
      console.error('Cookie consent detection failed:', error);
      return { hasDialog: false, confidence: 0 };
    }
  }

  /**
   * Waits for cookie dialog to be dismissed by polling detection
   */
  private async waitForCookieDialogDismissal(maxWaitTime: number = 15000): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every second
    
    while (Date.now() - startTime < maxWaitTime) {
      const detection = await this.detectCookieConsent();
      
      if (!detection.hasDialog) {
        console.log('✓ Cookie dialog dismissed or not present');
        return true;
      }
      
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`⏳ Cookie dialog still present (confidence: ${(detection.confidence * 100).toFixed(0)}%), waiting... [${elapsed}s/${maxWaitTime/1000}s]`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    console.log('⏱️  Timeout waiting for cookie dialog dismissal, proceeding with analysis');
    return false; // Timeout - proceed anyway
  }

  /**
   * Sets up listeners for first user interaction (click, keyboard, scroll)
   * Returns a promise that resolves when interaction is detected or timeout occurs
   */
  private setupFirstInteractionListener(timeoutMs: number = 20000): Promise<boolean> {
    return new Promise((resolve) => {
      const webContents = this.webContentsView.webContents;
      let resolved = false;
      let timeout: NodeJS.Timeout;
      
      const handleInteraction = () => {
        if (!resolved) {
          resolved = true;
          console.log('✓ User interaction detected');
          clearTimeout(timeout);
          webContents.removeListener('before-input-event', inputListener);
          resolve(true);
        }
      };
      
      // Listen for mouse/keyboard input
      const inputListener = (_: any, input: any) => {
        if (input.type === 'mouseDown' || input.type === 'keyDown') {
          handleInteraction();
        }
      };
      
      webContents.on('before-input-event', inputListener);
      
      // Inject script to detect scroll and send IPC message
      this.runJs(`
        (function() {
          let scrollFired = false;
          window.addEventListener('scroll', () => {
            if (!scrollFired) {
              scrollFired = true;
              // Scroll detected - this will be detected by the activity script
            }
          }, { once: true });
        })();
      `).catch(() => {
        // Ignore errors - scroll detection is optional
      });
      
      // Timeout fallback
      timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.log('⏱️  User interaction timeout reached, proceeding with analysis');
          webContents.removeListener('before-input-event', inputListener);
          resolve(false);
        }
      }, timeoutMs);
    });
  }

  /**
   * Handles content analysis with smart cookie dialog detection
   * Combines multiple strategies:
   * 1. Initial detection of cookie dialogs
   * 2. Wait for user dismissal (polling)
   * 3. Wait for user interaction (click/scroll/keyboard)
   * 4. Timeout fallback to ensure analysis happens eventually
   */
  private async handleContentAnalysisWithCookieDetection(
    activityId: string, 
    userId: string
  ): Promise<void> {
    try {
      // Wait a bit for page to settle and dynamic content to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if page is still loading
      if (this.webContentsView.webContents.isLoading()) {
        console.log('⏳ Page still loading, waiting for completion...');
        await new Promise<void>(resolve => {
          const loadHandler = () => resolve();
          this.webContentsView.webContents.once('did-finish-load', loadHandler);
        });
        // Give it another moment after load
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Detect initial cookie dialog
      console.log('🔍 Checking for cookie consent dialog...');
      const initialDetection = await this.detectCookieConsent();
      
      if (initialDetection.hasDialog) {
        console.log(`🍪 Cookie dialog detected with ${(initialDetection.confidence * 100).toFixed(0)}% confidence`);
        console.log('   Details:', JSON.stringify(initialDetection.details, null, 2));
        
        if (initialDetection.confidence > 0.6) {
          // High confidence - use both strategies in parallel
          console.log('📋 Strategy: Wait for user dismissal OR interaction (max 15s)');
          
          // Race between:
          // 1. Dialog dismissal (polling every second)
          // 2. User interaction (event-based)
          await Promise.race([
            this.waitForCookieDialogDismissal(15000),
            this.setupFirstInteractionListener(15000)
          ]);
          
          // Give page a moment to re-render after dialog dismissal
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Double-check if dialog is gone
          const postDismissalCheck = await this.detectCookieConsent();
          if (postDismissalCheck.hasDialog && postDismissalCheck.confidence > 0.5) {
            console.log(`⚠️  Cookie dialog still present (${(postDismissalCheck.confidence * 100).toFixed(0)}%), but proceeding with analysis`);
          } else {
            console.log('✓ Cookie dialog confirmed dismissed');
          }
        } else {
          // Low-medium confidence - shorter wait, might be false positive
          console.log('📋 Strategy: Brief wait for potential dialog dismissal (5s)');
          await Promise.race([
            this.waitForCookieDialogDismissal(5000),
            this.setupFirstInteractionListener(5000)
          ]);
        }
      } else {
        console.log('✓ No cookie dialog detected, proceeding immediately');
      }
      
      // Proceed with content analysis
      console.log('🚀 Starting content analysis...');
      await this.contentAnalyzer!.onPageVisit(activityId, this._url, userId, this);
      console.log('✓ Content analysis completed');
      
    } catch (error) {
      console.error('❌ Content analysis with cookie detection failed:', error);
      
      // Fallback: try analysis anyway without cookie handling
      console.log('🔄 Attempting fallback content analysis...');
      try {
        await this.contentAnalyzer!.onPageVisit(activityId, this._url, userId, this);
        console.log('✓ Fallback content analysis completed');
      } catch (fallbackError) {
        console.error('❌ Fallback content analysis also failed:', fallbackError);
      }
    }
  }

  hide(): void {
    this._isVisible = false;
    this.webContentsView.setVisible(false);
    
    // Record page interaction when hiding tab
    if (this.activityCollector) {
      this.recordPageInteraction('switch_tab');
    }
  }

  async screenshot(): Promise<NativeImage> {
    return await this.webContentsView.webContents.capturePage();
  }

  async getScreenshotWithMetadata(): Promise<{
    image: NativeImage;
    metadata: {
      viewportWidth: number;
      viewportHeight: number;
      documentHeight: number;
      scrollPosition: { x: number; y: number };
      zoomFactor: number;
      capturedAt: Date;
    };
  }> {
    const image = await this.screenshot();
    
    try {
      const metadata = await this.runJs(`
        (function() {
          return {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            documentHeight: document.documentElement.scrollHeight,
            scrollPosition: {
              x: window.scrollX,
              y: window.scrollY
            },
            zoomFactor: window.devicePixelRatio
          };
        })()
      `);
      
      return {
        image,
        metadata: {
          ...metadata,
          capturedAt: new Date()
        }
      };
    } catch (error) {
      console.error('Failed to get screenshot metadata:', error);
      // Return screenshot with default metadata
      return {
        image,
        metadata: {
          viewportWidth: -1,
          viewportHeight: -1,
          documentHeight: -1,
          scrollPosition: { x: 0, y: 0 },
          zoomFactor: 1,
          capturedAt: new Date()
        }
      };
    }
  }

  async runJs(code: string): Promise<any> {
    return await this.webContentsView.webContents.executeJavaScript(code);
  }

  async getTabHtml(): Promise<string> {
    try {
      // Wait for page to be fully loaded
      if (this.webContentsView.webContents.isLoading()) {
        await new Promise<void>((resolve) => {
          this.webContentsView.webContents.once('did-finish-load', () => resolve());
        });
      }

      // Execute with timeout
      const result = await Promise.race([
        this.runJs("document.documentElement.outerHTML"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout getting HTML')), 5000)
        )
      ]);

      return result as string;
    } catch (error) {
      console.error('Failed to get HTML:', error);
      return '';
    }
  }

  async getTabText(): Promise<string> {
    try {
      // Wait for page to be fully loaded
      if (this.webContentsView.webContents.isLoading()) {
        await new Promise<void>((resolve) => {
          this.webContentsView.webContents.once('did-finish-load', () => resolve());
        });
      }

      // Execute with timeout
      const result = await Promise.race([
        this.runJs("document.documentElement.innerText"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout getting text')), 5000)
        )
      ]);

      return result as string;
    } catch (error) {
      console.error('Failed to get page text:', error);
      
      // Fallback: try to extract text from HTML
      try {
        const html = await this.getTabHtml();
        if (html) {
          return this.stripHtmlTags(html);
        }
      } catch {
        // Ignore fallback errors
      }
      
      return '';
    }
  }

  async extractStructuredText(): Promise<{
    title: string;
    metaDescription?: string;
    headings: Array<{ level: number; text: string }>;
    paragraphs: string[];
    links: Array<{ text: string; href: string }>;
    fullText: string;
    textLength: number;
  }> {
    try {
      // Wait for page to be fully loaded
      if (this.webContentsView.webContents.isLoading()) {
        await new Promise<void>((resolve) => {
          this.webContentsView.webContents.once('did-finish-load', () => resolve());
        });
      }

      const extractionScript = `
        (function() {
          try {
            return {
              title: document.title || '',
              metaDescription: document.querySelector('meta[name="description"]')?.content || '',
              headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
                .map(h => ({
                  level: parseInt(h.tagName[1]),
                  text: h.innerText.trim()
                }))
                .filter(h => h.text.length > 0),
              paragraphs: Array.from(document.querySelectorAll('p'))
                .map(p => p.innerText.trim())
                .filter(t => t.length > 20),
              links: Array.from(document.querySelectorAll('a[href]'))
                .slice(0, 50)
                .map(a => ({
                  text: a.innerText.trim(),
                  href: a.href
                }))
                .filter(l => l.text.length > 0),
              fullText: document.body.innerText || '',
              textLength: (document.body.innerText || '').length
            };
          } catch (e) {
            return { error: e.message };
          }
        })()
      `;

      const result = await Promise.race([
        this.runJs(extractionScript),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout extracting text')), 5000)
        )
      ]) as any;

      if (result.error) {
        throw new Error(`Text extraction failed: ${result.error}`);
      }

      return result;
    } catch (error) {
      console.error('Failed to extract structured text:', error);
      
      // Return minimal structure with fallback text
      try {
        const text = await this.getTabText();
        return {
          title: this._title || '',
          metaDescription: undefined,
          headings: [],
          paragraphs: [],
          links: [],
          fullText: text,
          textLength: text.length
        };
      } catch {
        return {
          title: this._title || '',
          metaDescription: undefined,
          headings: [],
          paragraphs: [],
          links: [],
          fullText: '',
          textLength: 0
        };
      }
    }
  }

  private stripHtmlTags(html: string): string {
    // Basic HTML tag removal - not perfect but works for fallback
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  loadURL(url: string): Promise<void> {
    this._url = url;
    return this.webContentsView.webContents.loadURL(url);
  }

  goBack(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoBack()) {
      this.webContentsView.webContents.navigationHistory.goBack();
    }
  }

  goForward(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoForward()) {
      this.webContentsView.webContents.navigationHistory.goForward();
    }
  }

  reload(): void {
    this.webContentsView.webContents.reload();
  }

  stop(): void {
    this.webContentsView.webContents.stop();
  }

  destroy(): void {
    // Record final page interaction before destroying
    if (this.activityCollector) {
      this.recordPageInteraction('close');
    }
    
    this.webContentsView.webContents.close();
  }
}
