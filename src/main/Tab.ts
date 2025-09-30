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
      
      console.log(`Tab.triggerContentAnalysis: Triggering analysis for ${this._url} with activityId ${activityId}`);
      
      // Trigger analysis asynchronously (don't await - let it run in background)
      this.contentAnalyzer.onPageVisit(activityId, this._url, userId, this).catch(error => {
        console.error('Content analysis failed:', error);
      });
    } else {
      console.log(`Tab.triggerContentAnalysis: Skipping analysis - already analyzed or missing dependencies`);
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
