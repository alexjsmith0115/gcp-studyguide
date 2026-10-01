// Progress storage. Cloud mode keeps progress in the artifact's `db` store
// (owner-only rules), so it follows the owner across devices and Claude can
// read it. Local mode keeps it in this browser's localStorage.
//
// Documents (all under the artifact's db):
//   progress/state     { v, objectives:{id:{s,c,t}}, notes:{id:t}, labs:{id:t}, settings:{...}, last:{...} }
//   progress/qstats    { v, q:{questionId:{n,c,f,ft,l,lt,b,d,fl}} }
//   progress/cards     { v, c:{cardId:{n,c,f,ft,l,lt,b,d}} }   (flashcards; same fields as qstats)
//   progress/activity  { v, days:{"YYYY-MM-DD":{a,k,r,l,f}} }
//   mocks/<id>         one document per mock exam
// Uses deepMerge() from logic.js (the build concatenates the files).
// Store.slug names this guide's browser cache and exports; the app sets it
// before init() (for example "pca-workbook" or "pcd-workbook").
const DOC_PATHS = { state: "progress/state", qstats: "progress/qstats", cards: "progress/cards", activity: "progress/activity" };

function emptyData() {
  return {
    state: { v: 1, objectives: {}, notes: {}, labs: {}, settings: { examDate: null, mockSize: 50, mockMinutes: 120 }, last: null },
    qstats: { v: 1, q: {} },
    cards: { v: 1, c: {} },
    activity: { v: 1, days: {} },
    mocks: {},
  };
}

function lsGet(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

const clone = (o) => JSON.parse(JSON.stringify(o));

const Store = {
  slug: "pca-workbook",     // the guide's file name; set by the app
  appName: "PCA Workbook",  // the guide's display name; set by the app
  mode: "loading",          // "loading" | "cloud" | "local"
  note: "",                 // a short status message for the UI
  expectLocal: false,       // true when browser-only saving is normal (standalone page, other viewers)
  data: emptyData(),
  pendingWrites: 0,
  _db: null,
  _exists: {},
  _pending: {},
  _flushing: {},
  _timers: {},
  _mockPending: {},
  _mockTimers: {},
  _listeners: new Set(),
  _cacheTimer: null,

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); },
  _emit(kind) { for (const fn of this._listeners) { try { fn(kind); } catch (e) { console.error(e); } } },

  async init() {
    const cached = lsGet(this._cacheKey());
    if (cached && cached.state) this.data = deepMerge(emptyData(), cached);
    this._emit("data");
    const ok = await this._connect().catch((e) => { console.warn("db connect failed", e); return false; });
    if (!ok) this._goLocal(this.note || "Progress saves in this browser only.");
  },

  async _connect() {
    const c = window.claude;
    if (!c || typeof c.use !== "function") {
      this.expectLocal = true;
      this.note = "Progress saves in this browser only. To move it to another browser, use Copy progress as JSON and Import on the Progress page.";
      return false;
    }
    const db = await c.use("db");
    if (!db) { this.note = "Progress saves in this browser only (cloud storage is not available in this view)."; return false; }
    try {
      const user = await c.use("user");
      if (user && (await user.isOwner()) === false) {
        this.expectLocal = true;
        this.note = "Only the owner's progress saves to the cloud. Your progress saves in this browser only.";
        return false;
      }
    } catch { /* no user capability: let the first write decide */ }
    this._db = db;
    this.mode = "cloud";
    this.note = "Progress saves to your Claude account.";
    this._emit("mode");
    await Promise.all(Object.keys(DOC_PATHS).map((key) => this._subscribeDoc(key)));
    this._subscribeMocks();
    for (const key of Object.keys(DOC_PATHS)) if (this._pending[key]) this._flush(key);
    for (const id of Object.keys(this._mockPending)) if (this._mockPending[id]) this._flushMock(id);
    return true;
  },

  _subscribeDoc(key) {
    return new Promise((resolve) => {
      let first = true;
      this._db.doc(DOC_PATHS[key]).onSnapshot((snap) => {
        this._exists[key] = snap.exists;
        const server = snap.exists ? snap.data() : null;
        if (first) {
          first = false;
          // First cloud use on this device: upload what this browser already has.
          if (!server && this._hasContent(key)) this._queue(key, {});
          resolve();
        }
        if (server) {
          this.data[key] = deepMerge(deepMerge(emptyData()[key], clone(server)), this._pending[key] || {});
          this._saveCache();
          this._emit("data");
        }
      }, (err) => { this._onError(err, key); resolve(); });
    });
  },

  _subscribeMocks() {
    this._db.collection("mocks").onSnapshot((qs) => {
      const mocks = {};
      for (const d of qs.docs) mocks[d.id] = clone(d.data());
      for (const [id, doc] of Object.entries(this._mockPending)) if (doc) mocks[id] = doc;
      // Keep local-only mocks that are not on the server yet (for example after a reconnect).
      this.data.mocks = mocks;
      this._saveCache();
      this._emit("data");
    }, (err) => this._onError(err, "mocks"));
  },

  _hasContent(key) {
    const d = this.data[key];
    if (key === "qstats") return Object.keys(d.q || {}).length > 0;
    if (key === "cards") return Object.keys(d.c || {}).length > 0;
    if (key === "activity") return Object.keys(d.days || {}).length > 0;
    return Object.keys(d.objectives || {}).length + Object.keys(d.notes || {}).length + Object.keys(d.labs || {}).length > 0 || !!d.settings?.examDate;
  },

  /** Merge a patch into a document (optimistic), then persist. */
  patch(key, patch) {
    this.data[key] = deepMerge(this.data[key], patch);
    this._saveCache();
    this._emit("data");
    // While connecting, keep the patch queued; it flushes once cloud mode is ready.
    if (this.mode !== "local") this._queue(key, patch);
  },

  _queue(key, patch) {
    this._pending[key] = deepMerge(this._pending[key] || {}, patch);
    clearTimeout(this._timers[key]);
    this._timers[key] = setTimeout(() => this._flush(key), 700);
    this._updatePending();
  },

  async _flush(key) {
    if (this._flushing[key] || !this._pending[key] || this.mode !== "cloud") return;
    this._flushing[key] = true;
    const patch = this._pending[key];
    this._pending[key] = null;
    try {
      const ref = this._db.doc(DOC_PATHS[key]);
      if (this._exists[key]) await ref.update(patch);
      else { await ref.set(clone(this.data[key])); this._exists[key] = true; }
    } catch (err) {
      this._pending[key] = deepMerge(patch, this._pending[key] || {});
      this._onError(err, key, () => this._flush(key));
    } finally {
      this._flushing[key] = false;
      if (this._pending[key] && this.mode === "cloud") {
        clearTimeout(this._timers[key]);
        this._timers[key] = setTimeout(() => this._flush(key), 700);
      }
      this._updatePending();
    }
  },

  saveMock(id, doc, { now = false } = {}) {
    this.data.mocks[id] = doc;
    this._saveCache();
    this._emit("data");
    if (this.mode === "local") return;
    this._mockPending[id] = doc;
    clearTimeout(this._mockTimers[id]);
    this._mockTimers[id] = setTimeout(() => this._flushMock(id), now ? 0 : 1500);
    this._updatePending();
  },

  async _flushMock(id) {
    const doc = this._mockPending[id];
    if (!doc || this.mode !== "cloud") return;
    this._mockPending[id] = null;
    try {
      await this._db.doc("mocks/" + id).set(clone(doc));
    } catch (err) {
      if (!this._mockPending[id]) this._mockPending[id] = doc;
      this._onError(err, "mocks", () => this._flushMock(id));
    }
    this._updatePending();
  },

  async deleteMock(id) {
    delete this.data.mocks[id];
    this._mockPending[id] = null;
    this._saveCache();
    this._emit("data");
    if (this.mode === "cloud") {
      try { await this._db.doc("mocks/" + id).delete(); } catch (err) { this._onError(err, "mocks"); }
    }
  },

  async resetAll() {
    const ids = Object.keys(this.data.mocks);
    this.data = emptyData();
    this._pending = {};
    this._mockPending = {};
    this._saveCache();
    this._emit("data");
    if (this.mode === "cloud") {
      try {
        for (const path of Object.values(DOC_PATHS)) await this._db.doc(path).delete();
        for (const k of Object.keys(DOC_PATHS)) this._exists[k] = false;
        for (const id of ids) await this._db.doc("mocks/" + id).delete();
      } catch (err) { this._onError(err, "reset"); }
    }
  },

  exportData() {
    return { app: this.slug, version: 1, exportedAt: new Date().toISOString(), ...clone(this.data) };
  },

  importData(obj) {
    if (!obj || obj.app !== this.slug || !obj.state || !obj.qstats) throw new Error(`This is not a ${this.appName} export.`);
    const fresh = emptyData();
    this.data = {
      state: deepMerge(fresh.state, obj.state),
      qstats: deepMerge(fresh.qstats, obj.qstats),
      cards: deepMerge(fresh.cards, obj.cards || {}),
      activity: deepMerge(fresh.activity, obj.activity || {}),
      mocks: obj.mocks || {},
    };
    this._saveCache();
    this._emit("data");
    if (this.mode === "cloud") {
      for (const key of Object.keys(DOC_PATHS)) { this._exists[key] = false; this._queue(key, {}); }
      for (const [id, doc] of Object.entries(this.data.mocks)) this.saveMock(id, doc, { now: true });
    }
  },

  _onError(err, key, retry) {
    const code = err && err.code;
    console.warn("db error", key, code, err && err.message);
    if (code === "unavailable" || code === "resource_exhausted") {
      if (retry) setTimeout(retry, (code === "unavailable" ? 1500 : 8000) + Math.random() * 2000);
      return;
    }
    if (code === "quota_exceeded") {
      this.note = "Cloud storage is full. Delete old mock exams in Progress to free space.";
      this._emit("mode");
      return;
    }
    // invalid_argument (for example, not the owner), revoked, not_granted, disabled, unknown.
    this._goLocal("Could not save to your Claude account. Progress now saves in this browser only.");
  },

  _goLocal(note) {
    this.mode = "local";
    this.note = note;
    this._db = null;
    this._pending = {};
    this._mockPending = {};
    this.pendingWrites = 0;
    this._saveCache();
    this._emit("mode");
    this._emit("data");
  },

  _updatePending() {
    const n = Object.values(this._pending).filter(Boolean).length + Object.values(this._mockPending).filter(Boolean).length;
    if (n !== this.pendingWrites) { this.pendingWrites = n; this._emit("mode"); }
  },

  _cacheKey() { return `${this.slug}-v1`; },

  _saveCache() {
    clearTimeout(this._cacheTimer);
    this._cacheTimer = setTimeout(() => lsSet(this._cacheKey(), this.data), 250);
  },
};
