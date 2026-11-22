/**
 * Module giao tiếp trực tiếp với GitHub Gist API (Không qua backend trung gian).
 * Lưu trữ toàn bộ dữ liệu đã mã hóa trong một file `data.json` duy nhất trên Private Gist.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MyNoteGist = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const GITHUB_API = 'https://api.github.com';
  const DATA_FILENAME = 'data.json';
  const GIST_DESCRIPTION = 'My Note Vault - Encrypted Accounts Database [my-note-vault]';
  const GIST_TAG = '[my-note-vault]';

  /**
   * Trích xuất Gist ID nếu người dùng dán nguyên URL Gist hoặc chuỗi ID
   */
  function normalizeGistId(input) {
    if (!input) return '';
    const trimmed = String(input).trim();
    if (!trimmed) return '';

    if (trimmed.includes('gist.github.com') || trimmed.includes('api.github.com/gists/')) {
      try {
        const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        const url = new URL(candidate);
        const parts = url.pathname.split('/').filter(Boolean);

        if (url.hostname === 'api.github.com' && parts[0] === 'gists' && parts[1]) {
          return parts[1].replace(/[^a-zA-Z0-9]/g, '');
        }

        if (parts.length >= 2) {
          // Trường hợp /user/<gistId>/revisions hoặc /user/<gistId>/raw
          const subPages = new Set(['revisions', 'stargazers', 'forks', 'raw']);
          if (parts.length >= 3 && subPages.has(parts[2])) {
            return parts[1].replace(/[^a-zA-Z0-9]/g, '');
          }
          return parts[parts.length - 1].replace(/[^a-zA-Z0-9]/g, '');
        }
        return (parts[0] || '').replace(/[^a-zA-Z0-9]/g, '');
      } catch {
        // Không phải URL hợp lệ -> xử lý như chuỗi ID
      }
    }

    return trimmed.replace(/[^a-zA-Z0-9]/g, '');
  }

  async function githubRequest(path, token, options = {}) {
    const response = await fetch(`${GITHUB_API}${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      let detail = '';
      try {
        const errJson = await response.json();
        detail = errJson.message || '';
      } catch {
        // ignore
      }

      if (response.status === 401) {
        throw new Error('GitHub Token (PAT) không hợp lệ hoặc đã hết hạn (401).');
      }
      if (response.status === 403) {
        throw new Error(
          `Không đủ quyền truy cập Gist API (403). Hãy kiểm tra quyền "gist" của Token. ${detail}`
        );
      }
      if (response.status === 404) {
        throw new Error('Không tìm thấy Gist hoặc Token chưa được cấp quyền "Gists" (404).');
      }
      throw new Error(`Lỗi GitHub API (${response.status}): ${detail || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Tìm Private Gist đã tạo trước đó của My Note Vault (nếu người dùng không nhập Gist ID)
   */
  async function findExistingVaultGist(token) {
    const gists = await githubRequest('/gists?per_page=100', token);
    if (!Array.isArray(gists)) return null;

    const tagged = gists.find(
      (g) =>
        g.files &&
        g.files[DATA_FILENAME] &&
        typeof g.description === 'string' &&
        g.description.includes(GIST_TAG)
    );
    return tagged || null;
  }

  /**
   * Đọc nội dung file `data.json` từ một Gist theo ID
   */
  async function fetchVaultFromGist(token, gistId) {
    const cleanId = normalizeGistId(gistId);
    if (!cleanId) {
      throw new Error('Gist ID không hợp lệ.');
    }

    const gist = await githubRequest(`/gists/${cleanId}`, token);
    const file = gist.files && gist.files[DATA_FILENAME];
    if (!file) {
      throw new Error(`Gist (${cleanId}) không chứa file "${DATA_FILENAME}".`);
    }

    let rawContent = file.content;

    if (file.truncated && file.raw_url) {
      const rawRes = await fetch(file.raw_url, { cache: 'no-store' });
      if (!rawRes.ok) {
        throw new Error('Không thể tải nội dung đầy đủ của data.json từ Gist.');
      }
      rawContent = await rawRes.text();
    }

    let parsed = null;
    if (rawContent && rawContent.trim()) {
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        throw new Error('Nội dung file data.json trên Gist không phải JSON hợp lệ.');
      }
    }

    return {
      gistId: gist.id,
      htmlUrl: gist.html_url,
      isPublic: Boolean(gist.public),
      updatedAt: gist.updated_at,
      owner: gist.owner ? gist.owner.login : '',
      envelope: parsed,
    };
  }

  /**
   * Lấy nhanh thời điểm cập nhật mới nhất của Gist để phát hiện xung đột đa thiết bị
   */
  async function getGistUpdatedAt(token, gistId) {
    const cleanId = normalizeGistId(gistId);
    const gist = await githubRequest(`/gists/${cleanId}`, token);
    return gist.updated_at || null;
  }

  /**
   * Tạo mới một Private GitHub Gist chứa file `data.json` đã mã hóa
   */
  async function createPrivateVaultGist(token, encryptedEnvelope) {
    const gist = await githubRequest('/gists', token, {
      method: 'POST',
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: {
          [DATA_FILENAME]: {
            content: JSON.stringify(encryptedEnvelope, null, 2),
          },
        },
      }),
    });

    return {
      gistId: gist.id,
      htmlUrl: gist.html_url,
      isPublic: Boolean(gist.public),
      updatedAt: gist.updated_at,
      owner: gist.owner ? gist.owner.login : '',
      envelope: encryptedEnvelope,
    };
  }

  /**
   * Cập nhật file `data.json` trên Gist hiện tại
   */
  async function updateVaultGist(token, gistId, encryptedEnvelope) {
    const cleanId = normalizeGistId(gistId);
    const gist = await githubRequest(`/gists/${cleanId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        files: {
          [DATA_FILENAME]: {
            content: JSON.stringify(encryptedEnvelope, null, 2),
          },
        },
      }),
    });

    return {
      gistId: gist.id,
      htmlUrl: gist.html_url,
      isPublic: Boolean(gist.public),
      updatedAt: gist.updated_at,
      envelope: encryptedEnvelope,
    };
  }

  return {
    DATA_FILENAME,
    normalizeGistId,
    findExistingVaultGist,
    fetchVaultFromGist,
    getGistUpdatedAt,
    createPrivateVaultGist,
    updateVaultGist,
  };
});
