export default function SettingsModal({ open, token, onClose, onSave }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="settings-title">Settings</h3>
        <p>
          Qwin calls the Qwen model through Hugging Face Inference Providers. Paste a token with
          Inference access, or set <code>HF_TOKEN</code> on the server.
        </p>
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            const next = new FormData(event.currentTarget).get('token');
            onSave(String(next || '').trim());
            onClose();
          }}
        >
          <label className="hint" htmlFor="hf-token">
            Hugging Face token
          </label>
          <input
            id="hf-token"
            name="token"
            type="password"
            defaultValue={token}
            placeholder="hf_..."
            autoComplete="off"
          />
          <p className="hint">
            Create one at{' '}
            <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">
              huggingface.co/settings/tokens
            </a>
            . Stored only in this browser.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save token
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
