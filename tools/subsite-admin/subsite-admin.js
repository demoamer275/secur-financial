/* eslint-disable no-underscore-dangle, import/no-unresolved */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { LitElement, html, nothing } from 'da-lit';
import { slugify } from './utils.js';
import { createSite, deleteSite, listSites } from './flows.js';
import { readConfig } from './api.js';

async function loadStyles() {
  const resp = await fetch(new URL('./subsite-admin.css', import.meta.url));
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(await resp.text());
  return sheet;
}
const styles = await loadStyles();

class SubsiteAdmin extends LitElement {
  static properties = {
    ctx: { attribute: false },
    _siteName: { state: true },
    _users: { state: true },
    _sites: { state: true },
    _log: { state: true },
    _error: { state: true },
    _busy: { state: true },
  };

  constructor() {
    super();
    this._siteName = '';
    this._users = '';
    this._sites = [];
    this._log = [];
    this._busy = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.refresh();
    this.logPermissions();
  }

  async logPermissions() {
    try {
      const config = await readConfig(this.ctx);
      // eslint-disable-next-line no-console
      console.log('[SubSite Admin] permissions config:', config.permissions ?? '(no permissions sheet)', config);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[SubSite Admin] failed to read config:', e.message);
    }
  }

  async refresh() {
    try {
      this._sites = (await listSites(this.ctx)).sort();
    } catch (e) {
      this._error = e.message;
    }
  }

  async run(fn) {
    this._busy = true;
    this._error = undefined;
    this._log = [];
    const log = (msg) => { this._log = [...this._log, msg]; };
    try {
      await fn(log);
    } catch (e) {
      this._error = e.message;
    } finally {
      this._busy = false;
      await this.refresh();
    }
  }

  onCreate(e) {
    e.preventDefault();
    this.run(async (log) => {
      await createSite(this.ctx, this._siteName, this._users, log);
      this._siteName = '';
      this._users = '';
    });
  }

  onDelete(slug) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete /sites/${slug} and its sheet rows?`)) return;
    this.run((log) => deleteSite(this.ctx, slug, log));
  }

  renderCreate() {
    const slug = slugify(this._siteName);
    return html`
      <section>
        <h2>Create Site</h2>
        <form @submit=${this.onCreate}>
          <label>Site name
            <input type="text" .value=${this._siteName}
              @input=${(e) => { this._siteName = e.target.value; }} required>
          </label>
          <p class="hint">Folder: ${slug ? `/sites/${slug}` : '—'}</p>
          <label>Users (comma-separated)
            <input type="text" .value=${this._users}
              placeholder="user1@example.com, user2@example.com"
              @input=${(e) => { this._users = e.target.value.replace(/[\r\n]/g, ''); }} required>
          </label>
          <p class="hint">Enter a comma-separated list of users.</p>
          <button type="submit" ?disabled=${this._busy || !slug}>Create</button>
        </form>
      </section>`;
  }

  renderDelete() {
    return html`
      <section>
        <h2>Delete Site</h2>
        ${this._sites.length ? html`
          <ul class="sites">
            ${this._sites.map((slug) => html`
              <li>
                <span>/sites/${slug}</span>
                <button class="danger" ?disabled=${this._busy}
                  @click=${() => this.onDelete(slug)}>Delete</button>
              </li>`)}
          </ul>` : html`<p class="hint">No sites found.</p>`}
      </section>`;
  }

  renderStatus() {
    if (!this._log.length && !this._error) return nothing;
    return html`
      <section class="status">
        <ul>${this._log.map((m) => html`<li>${m}</li>`)}</ul>
        ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
      </section>`;
  }

  render() {
    return html`
      <h1>SubSite Admin</h1>
      ${this.renderCreate()}
      ${this.renderStatus()}
      ${this.renderDelete()}`;
  }
}

customElements.define('subsite-admin', SubsiteAdmin);

(async function init() {
  const { context, token } = await DA_SDK;
  const cmp = document.createElement('subsite-admin');
  cmp.ctx = { org: context.org, repo: context.repo, token };
  document.body.append(cmp);
}());
