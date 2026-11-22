const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VAULT_MARKER,
  encryptVaultData,
  decryptVaultData,
  generateStrongPassword,
} = require('../js/crypto.js');

const {
  DATA_FILENAME,
  normalizeGistId,
  findExistingVaultGist,
  fetchVaultFromGist,
  createPrivateVaultGist,
  updateVaultGist,
} = require('../js/gist.js');

test('encryptVaultData & decryptVaultData roundtrip with Vietnamese text', async () => {
  const payload = {
    version: 1,
    items: [
      {
        id: 'acc-1',
        title: 'Gmail chính',
        category: 'email',
        username: 'nguoidung@gmail.com',
        password: 'MậtKhẩuSiêuMạnh!2026',
        url: 'https://mail.google.com',
        notes: 'Mail khôi phục: backup@outlook.com',
        pinned: true,
      },
    ],
  };

  const envelope = await encryptVaultData(payload, 'master-pass-123');
  assert.equal(envelope.app, VAULT_MARKER);
  assert.equal(envelope.cipher, 'AES-256-GCM');
  assert.ok(envelope.salt);
  assert.ok(envelope.iv);
  assert.ok(envelope.ciphertext);
  assert.equal(JSON.stringify(envelope).includes('nguoidung@gmail.com'), false);

  const decrypted = await decryptVaultData(envelope, 'master-pass-123');
  assert.deepEqual(decrypted, payload);
});

test('decryptVaultData rejects wrong master password', async () => {
  const envelope = await encryptVaultData({ items: [{ title: 'GitHub' }] }, 'correct-pw');
  await assert.rejects(
    () => decryptVaultData(envelope, 'wrong-pw'),
    (err) => err.code === 'WRONG_PASSWORD'
  );
});

test('decryptVaultData rejects tampered ciphertext', async () => {
  const envelope = await encryptVaultData({ items: [{ title: 'GitHub' }] }, 'pw1234');
  const bytes = Buffer.from(envelope.ciphertext, 'base64');
  bytes[0] = bytes[0] ^ 0xff;
  envelope.ciphertext = bytes.toString('base64');

  await assert.rejects(
    () => decryptVaultData(envelope, 'pw1234'),
    (err) => err.code === 'WRONG_PASSWORD'
  );
});

test('generateStrongPassword returns requested length and diverse characters', () => {
  const pw = generateStrongPassword(20);
  assert.equal(pw.length, 20);
  assert.match(pw, /[a-z]/);
  assert.match(pw, /[A-Z]/);
  assert.match(pw, /[0-9]/);
  assert.match(pw, /[!@#$%^&*\-_=+?]/);
});

test('normalizeGistId extracts ID from URLs and raw strings', () => {
  assert.equal(normalizeGistId('  abc123def456  '), 'abc123def456');
  assert.equal(
    normalizeGistId('https://gist.github.com/myuser/abc123def456'),
    'abc123def456'
  );
  assert.equal(
    normalizeGistId('https://gist.github.com/myuser/abc123def456/revisions'),
    'abc123def456'
  );
  assert.equal(
    normalizeGistId('gist.github.com/myuser/abc123def456#file-data-json'),
    'abc123def456'
  );
  assert.equal(
    normalizeGistId('https://api.github.com/gists/abc123def456'),
    'abc123def456'
  );
});

test('GitHub Gist API client handles create, find, fetch, and update with mocked fetch', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  const calls = [];
  const sampleEnvelope = await encryptVaultData({ items: [] }, 'secret');

  global.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body, headers: init.headers });

    if (url.endsWith('/gists') && init.method === 'POST') {
      const parsedBody = JSON.parse(init.body);
      assert.equal(parsedBody.public, false);
      assert.ok(parsedBody.files[DATA_FILENAME]);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: 'gist999',
          html_url: 'https://gist.github.com/user/gist999',
          public: false,
          updated_at: '2026-11-22T08:00:00Z',
          owner: { login: 'user' },
        }),
      };
    }

    if (url.includes('/gists?per_page=100')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'other',
            description: 'Random note',
            files: { 'note.txt': { content: 'hi' } },
          },
          {
            id: 'gist999',
            description: 'My Note Vault - Encrypted Accounts Database [my-note-vault]',
            files: { [DATA_FILENAME]: { content: JSON.stringify(sampleEnvelope) } },
          },
        ],
      };
    }

    if (url.endsWith('/gists/gist999') && (!init.method || init.method === 'GET')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'gist999',
          html_url: 'https://gist.github.com/user/gist999',
          public: false,
          updated_at: '2026-11-22T08:00:00Z',
          owner: { login: 'user' },
          files: {
            [DATA_FILENAME]: {
              truncated: false,
              content: JSON.stringify(sampleEnvelope),
            },
          },
        }),
      };
    }

    if (url.endsWith('/gists/gist999') && init.method === 'PATCH') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'gist999',
          html_url: 'https://gist.github.com/user/gist999',
          public: false,
          updated_at: '2026-11-22T08:05:00Z',
        }),
      };
    }

    return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
  };

  const created = await createPrivateVaultGist('pat_test_123', sampleEnvelope);
  assert.equal(created.gistId, 'gist999');
  assert.equal(created.isPublic, false);

  const found = await findExistingVaultGist('pat_test_123');
  assert.equal(found.id, 'gist999');

  const fetched = await fetchVaultFromGist('pat_test_123', 'https://gist.github.com/user/gist999');
  assert.equal(fetched.gistId, 'gist999');
  assert.equal(fetched.envelope.app, VAULT_MARKER);

  const updated = await updateVaultGist('pat_test_123', 'gist999', sampleEnvelope);
  assert.equal(updated.updatedAt, '2026-11-22T08:05:00Z');
  assert.equal(calls.length, 4);
  assert.equal(calls[0].headers.Authorization, 'Bearer pat_test_123');
});
