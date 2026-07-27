// electron/preload.cjs — exposes a narrow window.yoga API
const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("yoga", {
  poses: {
    list: () => invoke("poses.list"),
    upsert: (input) => invoke("poses.upsert", input),
    toggleFavorite: (id, next) => invoke("poses.toggleFavorite", id, next),
    remove: (id) => invoke("poses.remove", id),
  },
  categories: {
    list: () => invoke("categories.list"),
  },
  tags: {
    list: () => invoke("tags.list"),
    create: (name) => invoke("tags.create", name),
  },
  sequences: {
    list: () => invoke("sequences.list"),
    get: (id) => invoke("sequences.get", id),
    create: (input) => invoke("sequences.create", input),
    update: (id, patch) => invoke("sequences.update", id, patch),
    setTags: (id, tagIds) => invoke("sequences.setTags", id, tagIds),
    remove: (id) => invoke("sequences.remove", id),
    duplicate: (id) => invoke("sequences.duplicate", id),
    addPose: (sid, pid) => invoke("sequences.addPose", sid, pid),
    removeItem: (itemId) => invoke("sequences.removeItem", itemId),
    duplicateItem: (item) => invoke("sequences.duplicateItem", item),
    updateItem: (itemId, patch) => invoke("sequences.updateItem", itemId, patch),
    reorder: (sid, orderedIds) => invoke("sequences.reorder", sid, orderedIds),
  },
  images: {
    importBase64: (name, base64) => invoke("images.importBase64", name, base64),
  },
});
