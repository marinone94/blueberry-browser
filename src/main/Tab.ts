import { NativeImage, WebContentsView } from "electron";

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
    // Update title when page title changes
    this.webContentsView.webContents.on("page-title-updated", (_, title) => {
      this._title = title;
      // Update history with new title if we have a callback
      this.recordHistoryEntry();
    });

    // Update URL when navigation occurs
    this.webContentsView.webContents.on("did-navigate", (_, url) => {
      this._url = url;
      this.recordHistoryEntry();
    });

    this.webContentsView.webContents.on("did-navigate-in-page", (_, url) => {
      this._url = url;
      this.recordHistoryEntry();
    });

    // Also track successful page loads
    this.webContentsView.webContents.on("did-finish-load", () => {
      this.recordHistoryEntry();
    });
  }

  private recordHistoryEntry(): void {
    // Only record history for visible/active tabs
    if (this.historyCallback && this._url && this._isVisible && 
        !this._url.startsWith('chrome://') && !this._url.startsWith('about:')) {
      // Get favicon if available
      this.webContentsView.webContents.executeJavaScript(`
        const link = document.querySelector('link[rel*="icon"]');
        link ? link.href : null;
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

  // Public methods
  show(): void {
    this._isVisible = true;
    this.webContentsView.setVisible(true);
    this.recordHistoryEntry();
  }

  hide(): void {
    this._isVisible = false;
    this.webContentsView.setVisible(false);
  }

  async screenshot(): Promise<NativeImage> {
    return await this.webContentsView.webContents.capturePage();
  }

  async runJs(code: string): Promise<any> {
    return await this.webContentsView.webContents.executeJavaScript(code);
  }

  async getTabHtml(): Promise<string> {
    return await this.runJs("return document.documentElement.outerHTML");
  }

  async getTabText(): Promise<string> {
    return await this.runJs("return document.documentElement.innerText");
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
    this.webContentsView.webContents.close();
  }
}
