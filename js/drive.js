/* Carnet de budget — sauvegarde Google Drive.
   Utilise Google Identity Services (connexion) et l'API Drive v3 avec le droit "drive.file" :
   l'appli ne voit QUE les fichiers qu'elle a elle-même créés dans ton Drive. */
(function (root) {
  "use strict";
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const FOLDER = "Carnet de budget - sauvegardes";
  const LATEST = "carnet-budget-derniere-sauvegarde.json";
  const KEEP_DAILY = 30;
  const TOKEN_KEY = "carnet-budget.drive-token";

  let token = null, exp = 0, folderId = null, loading = null;
  try { const t = JSON.parse(localStorage.getItem(TOKEN_KEY)); if (t && t.exp > Date.now()) { token = t.token; exp = t.exp; } } catch (e) {}

  function loadGis() {
    if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = () => res(); s.onerror = () => { loading = null; rej(new Error("Impossible de joindre Google. Vérifie ta connexion internet.")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  const Drive = {
    connected() { return !!token && exp > Date.now(); },
    disconnect() {
      try { if (token && root.google) root.google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
      token = null; exp = 0; folderId = null;
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    },
    /* À appeler depuis un appui sur un bouton (Google ouvre une fenêtre de connexion). */
    async connect(clientId) {
      if (!clientId) throw new Error("Ajoute d'abord ton ID client Google dans les réglages.");
      await loadGis();
      return new Promise((res, rej) => {
        const tc = root.google.accounts.oauth2.initTokenClient({
          client_id: clientId, scope: SCOPE,
          callback: r => {
            if (r.error) { rej(new Error(r.error_description || "Connexion Google refusée.")); return; }
            token = r.access_token; exp = Date.now() + (Number(r.expires_in || 3600) - 120) * 1000;
            try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp })); } catch (e) {}
            res();
          },
          error_callback: e => rej(new Error(e && e.type === "popup_closed" ? "Fenêtre Google fermée avant la fin de la connexion." : "Connexion Google impossible (" + ((e && e.type) || "erreur") + ")."))
        });
        tc.requestAccessToken({ prompt: "" });
      });
    },
    async api(url, opts = {}) {
      if (!this.connected()) throw Object.assign(new Error("Connexion Google expirée. Reconnecte-toi."), { code: "auth" });
      const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + token } });
      if (r.status === 401) { token = null; try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} throw Object.assign(new Error("Connexion Google expirée. Reconnecte-toi."), { code: "auth" }); }
      if (!r.ok) { let m = ""; try { m = (await r.json()).error.message; } catch (e) {} throw new Error("Google Drive a refusé la demande" + (m ? " : " + m : ".")); }
      return r;
    },
    async find(q) {
      const u = "https://www.googleapis.com/drive/v3/files?pageSize=100&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,size)&q=" + encodeURIComponent(q + " and trashed=false");
      return (await (await this.api(u)).json()).files || [];
    },
    async folder() {
      if (folderId) return folderId;
      const f = await this.find(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder'`);
      if (f.length) return (folderId = f[0].id);
      const r = await this.api("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: FOLDER, mimeType: "application/vnd.google-apps.folder" })
      });
      return (folderId = (await r.json()).id);
    },
    async put(name, json, existingId) {
      if (existingId) {
        await this.api(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: json
        });
        return existingId;
      }
      const parent = await this.folder();
      const b = "cb" + Math.random().toString(36).slice(2);
      const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent], mimeType: "application/json" })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${b}--`;
      const r = await this.api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
        method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body
      });
      return (await r.json()).id;
    },
    /* Met à jour la "dernière sauvegarde" + une copie datée du jour (30 jours gardés). */
    async backup(json) {
      const parent = await this.folder();
      const files = await this.find(`'${parent}' in parents`);
      const latest = files.find(f => f.name === LATEST);
      await this.put(LATEST, json, latest && latest.id);
      const day = new Date().toISOString().slice(0, 10);
      const dname = `carnet-budget-${day}.json`;
      const daily = files.find(f => f.name === dname);
      await this.put(dname, json, daily && daily.id);
      const old = files.filter(f => /^carnet-budget-\d{4}-\d{2}-\d{2}\.json$/.test(f.name) && f.name !== dname)
        .sort((a, b) => b.name.localeCompare(a.name)).slice(KEEP_DAILY - 1);
      for (const f of old) { try { await this.api(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: "DELETE" }); } catch (e) {} }
      return Date.now();
    },
    async list() {
      const parent = await this.folder();
      return (await this.find(`'${parent}' in parents`)).filter(f => /\.json$/.test(f.name));
    },
    async download(id) {
      return (await this.api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).text();
    }
  };
  root.Drive = Drive;
})(window);
