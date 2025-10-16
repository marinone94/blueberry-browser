import { app, BrowserWindow } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { Window } from "./Window";
import { AppMenu } from "./Menu";
import { IPCRegistry } from "./core/ipc";
import { ActivityIPCHandler } from "./features/activity";
import { TabIPCHandler } from "./features/tabs";
import { ContentIPCHandler } from "./features/content";
import { HistoryIPCHandler } from "./features/history";
import { ChatIPCHandler } from "./features/ai";
import { InsightsIPCHandler } from "./features/insights";
import { UserIPCHandler } from "./features/users";
import { UIIPCHandler } from "./ui";

let mainWindow: Window | null = null;
let ipcRegistry: IPCRegistry | null = null;
let menu: AppMenu | null = null;

const createWindow = async (): Promise<Window> => {
  const window = await Window.create();
  menu = new AppMenu(window);
  
  // Initialize the modular IPC Registry with feature-specific handlers
  ipcRegistry = new IPCRegistry();
  
  // Register all feature-specific IPC handlers
  ipcRegistry.registerHandler(new ActivityIPCHandler(window));
  ipcRegistry.registerHandler(new TabIPCHandler(window));
  ipcRegistry.registerHandler(new ContentIPCHandler(window));
  ipcRegistry.registerHandler(new HistoryIPCHandler(window));
  ipcRegistry.registerHandler(new ChatIPCHandler(window));
  ipcRegistry.registerHandler(new InsightsIPCHandler(window));
  ipcRegistry.registerHandler(new UserIPCHandler(window));
  ipcRegistry.registerHandler(new UIIPCHandler(window));
  
  console.log('[Main] IPC Registry initialized with handlers:', ipcRegistry.getHandlerNames());
  
  return window;
};

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.electron");

  mainWindow = await createWindow();

  app.on("activate", async () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // Clean up IPC handlers
  if (ipcRegistry) {
    ipcRegistry.cleanup();
    ipcRegistry = null;
  }

  // Clean up references
  if (mainWindow) {
    mainWindow = null;
  }
  if (menu) {
    menu = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
