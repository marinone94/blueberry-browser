import { app, BrowserWindow } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { Window } from "./Window";
import { AppMenu } from "./Menu";
import { EventManager } from "./EventManager";
import { IPCRegistry } from "./core/ipc";
import { ActivityIPCHandler } from "./features/activity";
import { TabIPCHandler } from "./features/tabs";

let mainWindow: Window | null = null;
let eventManager: EventManager | null = null;
let ipcRegistry: IPCRegistry | null = null;
let menu: AppMenu | null = null;

const createWindow = async (): Promise<Window> => {
  const window = await Window.create();
  menu = new AppMenu(window);
  
  // Initialize the legacy EventManager (will be gradually phased out)
  eventManager = new EventManager(window);
  
  // Initialize the new modular IPC Registry (Phase 1: running alongside EventManager)
  ipcRegistry = new IPCRegistry();
  
  // Register feature-specific IPC handlers
  // Note: These handlers duplicate some EventManager handlers for now
  // We'll remove the duplicate handlers from EventManager after testing
  ipcRegistry.registerHandler(new ActivityIPCHandler(window));
  ipcRegistry.registerHandler(new TabIPCHandler(window));
  
  console.log('[Main] IPC systems initialized:', {
    legacyEventManager: !!eventManager,
    newIPCRegistry: !!ipcRegistry,
    registeredHandlers: ipcRegistry.getHandlerNames()
  });
  
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
  
  if (eventManager) {
    eventManager.cleanup();
    eventManager = null;
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
