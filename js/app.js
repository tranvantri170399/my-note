(function () {
  const {
    VAULT_MARKER,
    encryptVaultData,
    decryptVaultData,
    generateStrongPassword,
  } = window.MyNoteCrypto;

  const {
    normalizeGistId,
    findExistingVaultGist,
    fetchVaultFromGist,
    getGistUpdatedAt,
    createPrivateVaultGist,
    updateVaultGist,
  } = window.MyNoteGist;

  const {
    toDatetimeLocalValue,
    fromDatetimeLocalValue,
    formatReminderDate,
    getReminderStatus,
    buildGoogleCalendarUrl,
  } = window.MyNoteReminder;

  const STORAGE_KEYS = {
    PAT: 'my_note_pat',
    GIST_ID: 'my_note_gist_id',
    THEME: 'my_note_theme',
  };

  const CATEGORY_LABELS = {
    email: 'Email',
    social: 'Mạng xã hội',
    work: 'Công việc',
    finance: 'Tài chính',
    dev: 'Dev / Cloud',
    other: 'Khác',
  };

  const state = {
    token: '',
    gistId: '',
    htmlUrl: '',
    isPublic: false,
    masterPassword: '',
    remoteUpdatedAt: null,
    lastEnvelope: null,
    items: [],
    filter: 'all',
    search: '',
    revealedIds: new Set(),
    pendingDeleteId: null,
    busy: false,
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    authView: $('auth-view'),
    vaultView: $('vault-view'),
    authThemeBtn: $('auth-theme-btn'),
    themeToggleBtn: $('theme-toggle-btn'),
    savedTokenBanner: $('saved-token-banner'),
    clearSavedTokenBtn: $('clear-saved-token-btn'),
    authForm: $('auth-form'),
    patInput: $('pat-input'),
    togglePatBtn: $('toggle-pat-btn'),
    gistIdInput: $('gist-id-input'),
    masterPasswordInput: $('master-password-input'),
    toggleMasterBtn: $('toggle-master-btn'),
    rememberPatCheckbox: $('remember-pat-checkbox'),
    authError: $('auth-error'),
    authSubmitBtn: $('auth-submit-btn'),

    syncDot: $('sync-dot'),
    syncStatus: $('sync-status'),
    gistVisibilityBadge: $('gist-visibility-badge'),
    gistLink: $('gist-link'),
    syncBtn: $('sync-btn'),
    backupMenuBtn: $('backup-menu-btn'),
    lockBtn: $('lock-btn'),
    searchInput: $('search-input'),
    addItemBtn: $('add-item-btn'),
    categoryFilters: $('category-filters'),
    filterUpcomingBtn: $('filter-upcoming-btn'),
    dueBanner: $('due-banner'),
    dueBannerText: $('due-banner-text'),
    dueBannerBtn: $('due-banner-btn'),
    itemsCount: $('items-count'),
    itemsList: $('items-list'),
    emptyState: $('empty-state'),
    emptyStateText: $('empty-state-text'),
    emptyAddBtn: $('empty-add-btn'),

    itemModal: $('item-modal'),
    itemModalTitle: $('item-modal-title'),
    closeItemModalBtn: $('close-item-modal-btn'),
    cancelItemBtn: $('cancel-item-btn'),
    itemForm: $('item-form'),
    itemId: $('item-id'),
    itemTitle: $('item-title'),
    itemCategory: $('item-category'),
    itemUsername: $('item-username'),
    itemPassword: $('item-password'),
    toggleItemPwBtn: $('toggle-item-pw-btn'),
    genPwBtn: $('gen-pw-btn'),
    itemUrl: $('item-url'),
    itemNotes: $('item-notes'),
    itemRemindAt: $('item-remind-at'),
    itemRemindNote: $('item-remind-note'),
    clearRemindBtn: $('clear-remind-btn'),
    modalGcalBtn: $('modal-gcal-btn'),
    itemPinned: $('item-pinned'),
    saveItemBtn: $('save-item-btn'),

    settingsModal: $('settings-modal'),
    closeSettingsModalBtn: $('close-settings-modal-btn'),
    displayGistId: $('display-gist-id'),
    displayGistVisibility: $('display-gist-visibility'),
    copyGistIdBtn: $('copy-gist-id-btn'),
    exportEncryptedBtn: $('export-encrypted-btn'),
    exportPlainBtn: $('export-plain-btn'),
    importFileInput: $('import-file-input'),
    importBtn: $('import-btn'),
    changePwForm: $('change-pw-form'),
    newMasterPw: $('new-master-pw'),
    confirmMasterPw: $('confirm-master-pw'),
    changePwSubmitBtn: $('change-pw-submit-btn'),
    logoutForgetBtn: $('logout-forget-btn'),

    deleteModal: $('delete-modal'),
    deleteItemName: $('delete-item-name'),
    cancelDeleteBtn: $('cancel-delete-btn'),
    confirmDeleteBtn: $('confirm-delete-btn'),

    toastContainer: $('toast-container'),
  };

  /* ------------------------- TIỆN ÍCH CHUNG ------------------------- */

  function generateId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeSearchText(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  function toSafeHref(rawUrl) {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) return '';
    const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch {
      return '';
    }
    return '';
  }

  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3200);
  }

  function setAuthError(message) {
    if (!message) {
      els.authError.textContent = '';
      els.authError.classList.add('hidden');
      return;
    }
    els.authError.textContent = message;
    els.authError.classList.remove('hidden');
  }

  function setSyncIndicator(status, text) {
    els.syncDot.className = 'dot';
    if (status === 'syncing') {
      els.syncDot.classList.add('dot-syncing');
    } else if (status === 'error') {
      els.syncDot.classList.add('dot-error');
    } else {
      els.syncDot.classList.add('dot-ok');
    }
    els.syncStatus.textContent = text;
  }

  function toggleInputVisibility(input, button) {
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    button.textContent = isPassword ? 'Ẩn' : 'Hiện';
  }

  async function copyText(value, triggerBtn) {
    if (!value) {
      showToast('Trường này đang trống.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      if (triggerBtn) {
        const original = triggerBtn.textContent;
        triggerBtn.textContent = 'Đã copy';
        triggerBtn.disabled = true;
        setTimeout(() => {
          triggerBtn.textContent = original;
          triggerBtn.disabled = false;
        }, 1400);
      } else {
        showToast('Đã copy vào clipboard.');
      }
    } catch {
      showToast('Trình duyệt không cho phép copy tự động.', true);
    }
  }

  function downloadJsonFile(filename, dataObj) {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ------------------------- THEME & LOCALSTORAGE ------------------------- */

  function applyTheme(theme) {
    const resolved = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', resolved);
    localStorage.setItem(STORAGE_KEYS.THEME, resolved);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  function loadSavedCredentials() {
    const savedPat = localStorage.getItem(STORAGE_KEYS.PAT) || '';
    const savedGistId = localStorage.getItem(STORAGE_KEYS.GIST_ID) || '';

    els.patInput.value = savedPat;
    els.gistIdInput.value = savedGistId;

    if (savedPat) {
      els.savedTokenBanner.classList.remove('hidden');
      els.rememberPatCheckbox.checked = true;
      setTimeout(() => els.masterPasswordInput.focus(), 50);
    } else {
      els.savedTokenBanner.classList.add('hidden');
      setTimeout(() => els.patInput.focus(), 50);
    }
  }

  function saveCredentialsIfRequested(token, gistId) {
    if (els.rememberPatCheckbox.checked) {
      localStorage.setItem(STORAGE_KEYS.PAT, token);
      if (gistId) {
        localStorage.setItem(STORAGE_KEYS.GIST_ID, gistId);
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.PAT);
      localStorage.removeItem(STORAGE_KEYS.GIST_ID);
    }
  }

  function clearSavedCredentials() {
    localStorage.removeItem(STORAGE_KEYS.PAT);
    localStorage.removeItem(STORAGE_KEYS.GIST_ID);
    els.patInput.value = '';
    els.gistIdInput.value = '';
    els.savedTokenBanner.classList.add('hidden');
    showToast('Đã xóa Token khỏi localStorage.');
  }

  /* ------------------------- CHUẨN HÓA DỮ LIỆU VAULT ------------------------- */

  function sanitizeItem(raw) {
    const now = new Date().toISOString();
    const category = CATEGORY_LABELS[raw?.category] ? raw.category : 'other';
    const rawRemindAt = typeof raw?.remindAt === 'string' ? raw.remindAt.trim() : '';
    const remindAt = rawRemindAt && !Number.isNaN(Date.parse(rawRemindAt)) ? rawRemindAt : '';

    return {
      id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : generateId(),
      title: String(raw?.title || 'Chưa đặt tên').trim(),
      category,
      username: String(raw?.username || ''),
      password: String(raw?.password || ''),
      url: String(raw?.url || '').trim(),
      notes: String(raw?.notes || ''),
      remindAt,
      remindNote: String(raw?.remindNote || '').trim(),
      remindDone: Boolean(raw?.remindDone && remindAt),
      pinned: Boolean(raw?.pinned),
      createdAt: raw?.createdAt || now,
      updatedAt: raw?.updatedAt || now,
    };
  }

  function normalizeVaultPayload(decrypted) {
    if (Array.isArray(decrypted)) {
      return decrypted.map(sanitizeItem);
    }
    if (decrypted && Array.isArray(decrypted.items)) {
      return decrypted.items.map(sanitizeItem);
    }
    return [];
  }

  function buildPlainVaultPayload(items) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      items,
    };
  }

  /* ------------------------- ĐĂNG NHẬP / ĐỒNG BỘ GIST ------------------------- */

  function updateGistHeaderInfo() {
    els.gistLink.href = state.htmlUrl || `https://gist.github.com/${state.gistId}`;
    els.displayGistId.value = state.gistId;

    const visText = state.isPublic ? '⚠ Public Gist' : '🔒 Private';
    els.gistVisibilityBadge.textContent = visText;
    els.gistVisibilityBadge.classList.toggle('is-public', state.isPublic);

    els.displayGistVisibility.textContent = state.isPublic ? '⚠ Public' : '🔒 Private';
    els.displayGistVisibility.classList.toggle('is-public', state.isPublic);
  }

  async function handleUnlock(event) {
    event.preventDefault();
    if (state.busy) return;
    setAuthError('');

    const token = els.patInput.value.trim();
    const inputGistId = normalizeGistId(els.gistIdInput.value);
    const masterPassword = els.masterPasswordInput.value;

    if (!token) {
      setAuthError('Vui lòng nhập GitHub Personal Access Token (PAT).');
      return;
    }
    if (!masterPassword) {
      setAuthError('Vui lòng nhập Master Password.');
      return;
    }

    state.busy = true;
    els.authSubmitBtn.disabled = true;
    els.authSubmitBtn.textContent = 'Đang kết nối GitHub Gist...';

    try {
      let vaultInfo = null;
      let items = [];

      if (inputGistId) {
        vaultInfo = await fetchVaultFromGist(token, inputGistId);
      } else {
        els.authSubmitBtn.textContent = 'Đang tìm Private Gist...';
        const existing = await findExistingVaultGist(token);
        if (existing) {
          vaultInfo = await fetchVaultFromGist(token, existing.id);
        }
      }

      if (vaultInfo) {
        if (vaultInfo.envelope === null) {
          // Trường hợp người dùng tự tạo sẵn Gist chứa file data.json trống
          els.authSubmitBtn.textContent = 'Đang khởi tạo mã hóa...';
          const initialPayload = buildPlainVaultPayload([]);
          const initialEnvelope = await encryptVaultData(initialPayload, masterPassword);
          const updated = await updateVaultGist(token, vaultInfo.gistId, initialEnvelope);
          vaultInfo = {
            ...vaultInfo,
            updatedAt: updated.updatedAt,
            envelope: initialEnvelope,
          };
          items = [];
          showToast('Đã khởi tạo mã hóa cho file data.json trên Gist.');
        } else {
          els.authSubmitBtn.textContent = 'Đang giải mã dữ liệu...';
          const decrypted = await decryptVaultData(vaultInfo.envelope, masterPassword);
          items = normalizeVaultPayload(decrypted);
        }
      } else {
        // Lần đầu tiên -> Tạo mới Private Gist
        els.authSubmitBtn.textContent = 'Đang tạo Private Gist mới...';
        const initialPayload = buildPlainVaultPayload([]);
        const initialEnvelope = await encryptVaultData(initialPayload, masterPassword);
        vaultInfo = await createPrivateVaultGist(token, initialEnvelope);
        items = [];
        showToast('Đã tạo Private Gist mới để lưu data.json!');
      }

      state.token = token;
      state.gistId = vaultInfo.gistId;
      state.htmlUrl = vaultInfo.htmlUrl;
      state.isPublic = Boolean(vaultInfo.isPublic);
      state.masterPassword = masterPassword;
      state.remoteUpdatedAt = vaultInfo.updatedAt;
      state.lastEnvelope = vaultInfo.envelope;
      state.items = items;
      state.revealedIds.clear();

      saveCredentialsIfRequested(token, vaultInfo.gistId);
      els.masterPasswordInput.value = '';

      updateGistHeaderInfo();
      setSyncIndicator('ok', 'Đã đồng bộ');
      els.authView.classList.add('hidden');
      els.vaultView.classList.remove('hidden');
      renderItems();

      if (state.isPublic) {
        showToast('Cảnh báo: Gist này đang ở chế độ Public!', true);
      }
    } catch (err) {
      setAuthError(err.message || 'Không thể mở khóa kho dữ liệu.');
    } finally {
      state.busy = false;
      els.authSubmitBtn.disabled = false;
      els.authSubmitBtn.textContent = 'Mở khóa kho dữ liệu';
    }
  }

  async function syncFromGist() {
    if (state.busy) return;
    state.busy = true;
    els.syncBtn.disabled = true;
    setSyncIndicator('syncing', 'Đang tải...');

    try {
      const vaultInfo = await fetchVaultFromGist(state.token, state.gistId);
      if (vaultInfo.envelope === null) {
        state.items = [];
      } else {
        const decrypted = await decryptVaultData(vaultInfo.envelope, state.masterPassword);
        state.items = normalizeVaultPayload(decrypted);
      }
      state.htmlUrl = vaultInfo.htmlUrl;
      state.isPublic = Boolean(vaultInfo.isPublic);
      state.remoteUpdatedAt = vaultInfo.updatedAt;
      state.lastEnvelope = vaultInfo.envelope;
      state.revealedIds.clear();

      updateGistHeaderInfo();
      renderItems();
      setSyncIndicator('ok', 'Đã đồng bộ');
      showToast('Đã cập nhật dữ liệu mới nhất từ Gist.');
    } catch (err) {
      setSyncIndicator('error', 'Lỗi đồng bộ');
      showToast(err.message || 'Không thể đồng bộ từ Gist.', true);
    } finally {
      state.busy = false;
      els.syncBtn.disabled = false;
    }
  }

  async function persistItemsToGist(nextItems, successMessage) {
    setSyncIndicator('syncing', 'Đang mã hóa & lưu...');

    // Kiểm tra xung đột đa thiết bị trước khi ghi đè data.json
    if (state.remoteUpdatedAt) {
      const latestRemoteUpdatedAt = await getGistUpdatedAt(state.token, state.gistId);
      if (latestRemoteUpdatedAt && latestRemoteUpdatedAt !== state.remoteUpdatedAt) {
        const forceOverwrite = window.confirm(
          'Dữ liệu trên GitHub Gist vừa được cập nhật từ thiết bị hoặc tab khác.\n\n' +
            '• Bấm OK để GHI ĐÈ bằng dữ liệu hiện tại.\n' +
            '• Bấm Hủy rồi bấm nút "Đồng bộ" để tải bản mới nhất trước.'
        );
        if (!forceOverwrite) {
          setSyncIndicator('error', 'Cần đồng bộ');
          return false;
        }
      }
    }

    const payload = buildPlainVaultPayload(nextItems);
    const envelope = await encryptVaultData(payload, state.masterPassword);
    const updated = await updateVaultGist(state.token, state.gistId, envelope);

    state.items = nextItems;
    state.lastEnvelope = envelope;
    state.remoteUpdatedAt = updated.updatedAt;
    setSyncIndicator('ok', 'Đã đồng bộ');
    renderItems();
    if (successMessage) {
      showToast(successMessage);
    }
    return true;
  }

  function lockVault() {
    state.token = '';
    state.gistId = '';
    state.htmlUrl = '';
    state.isPublic = false;
    state.masterPassword = '';
    state.remoteUpdatedAt = null;
    state.lastEnvelope = null;
    state.items = [];
    state.revealedIds.clear();
    state.pendingDeleteId = null;

    els.itemsList.textContent = '';
    els.searchInput.value = '';
    state.search = '';
    closeItemModal();
    closeSettingsModal();
    closeDeleteModal();

    els.vaultView.classList.add('hidden');
    els.authView.classList.remove('hidden');
    setAuthError('');
    loadSavedCredentials();
  }

  /* ------------------------- RENDER DANH SÁCH ------------------------- */

  function setActiveFilter(filterName) {
    state.filter = filterName || 'all';
    for (const btn of els.categoryFilters.querySelectorAll('.chip')) {
      btn.classList.toggle('active', btn.dataset.filter === state.filter);
    }
    renderItems();
  }

  function updateReminderSummary() {
    let activeCount = 0;
    let overdueCount = 0;
    let soonCount = 0;

    for (const item of state.items) {
      const status = getReminderStatus(item);
      if (status.state === 'overdue') {
        activeCount += 1;
        overdueCount += 1;
      } else if (status.state === 'soon') {
        activeCount += 1;
        soonCount += 1;
      } else if (status.state === 'scheduled') {
        activeCount += 1;
      }
    }

    els.filterUpcomingBtn.textContent =
      activeCount > 0 ? `⏰ Có lịch hẹn (${activeCount})` : '⏰ Có lịch hẹn';

    const urgentCount = overdueCount + soonCount;
    if (urgentCount === 0 || state.filter === 'upcoming') {
      els.dueBanner.classList.add('hidden');
      els.dueBanner.classList.remove('has-overdue');
      return;
    }

    const parts = [];
    if (overdueCount > 0) parts.push(`${overdueCount} mục quá hạn`);
    if (soonCount > 0) parts.push(`${soonCount} mục sắp đến hạn (trong 7 ngày tới)`);
    els.dueBannerText.textContent = `⏰ Nhắc nhở: Có ${parts.join(' và ')}.`;
    els.dueBanner.classList.toggle('has-overdue', overdueCount > 0);
    els.dueBanner.classList.remove('hidden');
  }

  function getFilteredItems() {
    const query = normalizeSearchText(state.search.trim());

    return state.items
      .filter((item) => {
        if (state.filter === 'pinned' && !item.pinned) return false;
        if (state.filter === 'upcoming') {
          if (!item.remindAt || item.remindDone) return false;
        } else if (
          state.filter !== 'all' &&
          state.filter !== 'pinned' &&
          item.category !== state.filter
        ) {
          return false;
        }
        if (!query) return true;

        const haystack = normalizeSearchText(
          `${item.title} ${item.username} ${item.url} ${item.notes} ${item.remindNote || ''} ${
            CATEGORY_LABELS[item.category] || ''
          }`
        );
        return haystack.includes(query);
      })
      .sort((a, b) => {
        if (state.filter === 'upcoming') {
          return Date.parse(a.remindAt) - Date.parse(b.remindAt);
        }
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }

  function createCredRow(labelText, displayText, copyValue, extraButtons = []) {
    const row = document.createElement('div');
    row.className = 'cred-row';

    const main = document.createElement('div');
    main.className = 'cred-main';

    const label = document.createElement('span');
    label.className = 'cred-label';
    label.textContent = labelText;

    const val = document.createElement('span');
    val.className = 'cred-value';
    val.textContent = displayText;

    main.appendChild(label);
    main.appendChild(val);

    const btns = document.createElement('div');
    btns.className = 'cred-btns';

    for (const btn of extraButtons) {
      btns.appendChild(btn);
    }

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'copy-pill';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => copyText(copyValue, copyBtn));
    btns.appendChild(copyBtn);

    row.appendChild(main);
    row.appendChild(btns);
    return row;
  }

  function createReminderBlock(item) {
    const status = getReminderStatus(item);
    if (status.state === 'none') return null;

    const box = document.createElement('div');
    box.className = `card-reminder state-${status.state}`;

    const top = document.createElement('div');
    top.className = 'card-reminder-top';

    const badge = document.createElement('span');
    badge.className = 'card-reminder-badge';
    const prefix =
      status.state === 'overdue'
        ? '⚠ Quá hạn'
        : status.state === 'done'
          ? '✓ Đã xong'
          : `⏰ ${status.label}`;
    badge.textContent = `${prefix}: ${formatReminderDate(item.remindAt)}`;
    top.appendChild(badge);
    box.appendChild(top);

    if (item.remindNote) {
      const note = document.createElement('div');
      note.className = 'card-reminder-note';
      note.textContent = item.remindNote;
      box.appendChild(note);
    }

    const actions = document.createElement('div');
    actions.className = 'card-reminder-actions';

    const gcalUrl = buildGoogleCalendarUrl(item);
    if (gcalUrl) {
      const gcalLink = document.createElement('a');
      gcalLink.className = 'gcal-link';
      gcalLink.href = gcalUrl;
      gcalLink.target = '_blank';
      gcalLink.rel = 'noopener noreferrer';
      gcalLink.textContent = '📅 Google Calendar';
      actions.appendChild(gcalLink);
    }

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'copy-pill';
    doneBtn.textContent = item.remindDone ? '↺ Nhắc lại' : '✓ Đã xong';
    doneBtn.addEventListener('click', () => toggleReminderDone(item.id));
    actions.appendChild(doneBtn);

    box.appendChild(actions);
    return box;
  }

  function renderItems() {
    updateReminderSummary();
    const filtered = getFilteredItems();
    const total = state.items.length;
    els.itemsCount.textContent =
      filtered.length === total
        ? `${total} mục`
        : `Hiển thị ${filtered.length} / ${total} mục`;

    els.itemsList.textContent = '';

    if (filtered.length === 0) {
      els.emptyState.classList.remove('hidden');
      els.emptyStateText.textContent =
        total === 0
          ? 'Kho dữ liệu đang trống. Hãy thêm mail hoặc tài khoản đầu tiên.'
          : 'Không tìm thấy mục nào khớp với bộ lọc hiện tại.';
      els.emptyAddBtn.classList.toggle('hidden', total > 0);
      return;
    }

    els.emptyState.classList.add('hidden');
    const fragment = document.createDocumentFragment();

    for (const item of filtered) {
      const card = document.createElement('article');
      card.className = 'item-card';

      // Header
      const top = document.createElement('div');
      top.className = 'card-top';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'card-title-wrap';

      const titleRow = document.createElement('div');
      titleRow.className = 'card-title';

      const pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      pinBtn.className = `pin-btn${item.pinned ? ' pinned' : ''}`;
      pinBtn.title = item.pinned ? 'Bỏ ghim' : 'Ghim lên đầu';
      pinBtn.textContent = item.pinned ? '★' : '☆';
      pinBtn.addEventListener('click', () => togglePinItem(item.id));

      const titleSpan = document.createElement('span');
      titleSpan.textContent = item.title;

      titleRow.appendChild(pinBtn);
      titleRow.appendChild(titleSpan);

      const catTag = document.createElement('span');
      catTag.className = 'cat-tag';
      catTag.textContent = CATEGORY_LABELS[item.category] || 'Khác';

      titleWrap.appendChild(titleRow);
      titleWrap.appendChild(catTag);

      const actions = document.createElement('div');
      actions.className = 'card-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'mini-btn';
      editBtn.textContent = 'Sửa';
      editBtn.addEventListener('click', () => openItemModal(item));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'mini-btn danger';
      delBtn.textContent = 'Xóa';
      delBtn.addEventListener('click', () => openDeleteModal(item));

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      top.appendChild(titleWrap);
      top.appendChild(actions);
      card.appendChild(top);

      // Email / Username
      if (item.username) {
        card.appendChild(
          createCredRow('Email / Đăng nhập', item.username, item.username)
        );
      }

      // Password
      if (item.password) {
        const isRevealed = state.revealedIds.has(item.id);
        const masked = '•'.repeat(Math.min(Math.max(item.password.length, 8), 16));

        const revealBtn = document.createElement('button');
        revealBtn.type = 'button';
        revealBtn.className = 'copy-pill';
        revealBtn.textContent = isRevealed ? 'Ẩn' : 'Hiện';
        revealBtn.addEventListener('click', () => {
          if (state.revealedIds.has(item.id)) {
            state.revealedIds.delete(item.id);
          } else {
            state.revealedIds.add(item.id);
          }
          renderItems();
        });

        card.appendChild(
          createCredRow(
            'Mật khẩu',
            isRevealed ? item.password : masked,
            item.password,
            [revealBtn]
          )
        );
      }

      // Safe Website Link
      if (item.url) {
        const safeHref = toSafeHref(item.url);
        if (safeHref) {
          const link = document.createElement('a');
          link.className = 'card-url';
          link.href = safeHref;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = `↗ ${item.url}`;
          card.appendChild(link);
        } else {
          const urlText = document.createElement('div');
          urlText.className = 'card-url';
          urlText.textContent = item.url;
          card.appendChild(urlText);
        }
      }

      // Notes
      if (item.notes) {
        const notes = document.createElement('div');
        notes.className = 'card-notes';
        notes.textContent = item.notes;
        card.appendChild(notes);
      }

      // Reminder & Google Calendar
      const reminderBlock = createReminderBlock(item);
      if (reminderBlock) {
        card.appendChild(reminderBlock);
      }

      fragment.appendChild(card);
    }

    els.itemsList.appendChild(fragment);
  }

  /* ------------------------- THÊM / SỬA / GHIM / XÓA ------------------------- */

  function syncModalReminderControls() {
    const hasRemindDate = Boolean(els.itemRemindAt.value && els.itemRemindAt.value.trim());
    els.clearRemindBtn.classList.toggle('hidden', !hasRemindDate);
    els.modalGcalBtn.classList.toggle('hidden', !hasRemindDate);
  }

  function openItemModal(item = null) {
    els.itemForm.reset();
    els.itemPassword.type = 'password';
    els.toggleItemPwBtn.textContent = 'Hiện';

    if (item) {
      els.itemModalTitle.textContent = 'Chỉnh sửa tài khoản';
      els.itemId.value = item.id;
      els.itemTitle.value = item.title;
      els.itemCategory.value = CATEGORY_LABELS[item.category] ? item.category : 'other';
      els.itemUsername.value = item.username;
      els.itemPassword.value = item.password;
      els.itemUrl.value = item.url;
      els.itemNotes.value = item.notes;
      els.itemRemindAt.value = item.remindAt ? toDatetimeLocalValue(item.remindAt) : '';
      els.itemRemindNote.value = item.remindNote || '';
      els.itemPinned.checked = Boolean(item.pinned);
    } else {
      els.itemModalTitle.textContent = 'Thêm tài khoản mới';
      els.itemId.value = '';
      els.itemCategory.value = CATEGORY_LABELS[state.filter] ? state.filter : 'email';
      els.itemRemindAt.value = '';
      els.itemRemindNote.value = '';
      els.itemPinned.checked = false;
    }

    syncModalReminderControls();
    els.itemModal.classList.remove('hidden');
    setTimeout(() => els.itemTitle.focus(), 30);
  }

  function closeItemModal() {
    els.itemModal.classList.add('hidden');
  }

  async function handleSaveItem(event) {
    event.preventDefault();
    if (state.busy) return;

    const title = els.itemTitle.value.trim();
    if (!title) {
      showToast('Vui lòng nhập Tên dịch vụ / Tiêu đề.', true);
      return;
    }

    const editingId = els.itemId.value.trim();
    const now = new Date().toISOString();
    const existing = editingId ? state.items.find((x) => x.id === editingId) : null;

    const remindAt = fromDatetimeLocalValue(els.itemRemindAt.value);
    const remindNote = els.itemRemindNote.value.trim();
    const remindChanged = !existing || existing.remindAt !== remindAt;
    const remindDone = remindAt ? (remindChanged ? false : Boolean(existing.remindDone)) : false;

    const nextItem = {
      id: existing ? existing.id : generateId(),
      title,
      category: els.itemCategory.value,
      username: els.itemUsername.value.trim(),
      password: els.itemPassword.value,
      url: els.itemUrl.value.trim(),
      notes: els.itemNotes.value.trim(),
      remindAt,
      remindNote,
      remindDone,
      pinned: els.itemPinned.checked,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    const nextItems = existing
      ? state.items.map((x) => (x.id === existing.id ? nextItem : x))
      : [nextItem, ...state.items];

    state.busy = true;
    els.saveItemBtn.disabled = true;
    els.saveItemBtn.textContent = 'Đang lưu lên Gist...';

    try {
      const saved = await persistItemsToGist(
        nextItems,
        existing ? 'Đã cập nhật tài khoản lên Gist.' : 'Đã thêm tài khoản mới lên Gist.'
      );
      if (saved) {
        closeItemModal();
      }
    } catch (err) {
      setSyncIndicator('error', 'Lỗi lưu');
      showToast(err.message || 'Không thể lưu lên Gist.', true);
    } finally {
      state.busy = false;
      els.saveItemBtn.disabled = false;
      els.saveItemBtn.textContent = 'Lưu & Mã hóa lên Gist';
    }
  }

  async function updateSingleItem(itemId, updater, errorMessage) {
    if (state.busy) return;
    state.busy = true;
    const now = new Date().toISOString();
    const nextItems = state.items.map((item) =>
      item.id === itemId ? { ...item, ...updater(item), updatedAt: now } : item
    );

    try {
      await persistItemsToGist(nextItems);
    } catch (err) {
      setSyncIndicator('error', 'Lỗi lưu');
      showToast(err.message || errorMessage, true);
    } finally {
      state.busy = false;
    }
  }

  function togglePinItem(itemId) {
    return updateSingleItem(
      itemId,
      (item) => ({ pinned: !item.pinned }),
      'Không thể cập nhật trạng thái ghim.'
    );
  }

  function toggleReminderDone(itemId) {
    return updateSingleItem(
      itemId,
      (item) => ({ remindDone: !item.remindDone }),
      'Không thể cập nhật trạng thái nhắc nhở.'
    );
  }

  function openDeleteModal(item) {
    state.pendingDeleteId = item.id;
    els.deleteItemName.textContent = item.title;
    els.deleteModal.classList.remove('hidden');
  }

  function closeDeleteModal() {
    state.pendingDeleteId = null;
    els.deleteModal.classList.add('hidden');
  }

  async function handleConfirmDelete() {
    if (state.busy || !state.pendingDeleteId) return;

    const targetId = state.pendingDeleteId;
    const nextItems = state.items.filter((x) => x.id !== targetId);

    state.busy = true;
    els.confirmDeleteBtn.disabled = true;
    els.confirmDeleteBtn.textContent = 'Đang xóa...';

    try {
      const saved = await persistItemsToGist(nextItems, 'Đã xóa tài khoản khỏi Gist.');
      if (saved) {
        state.revealedIds.delete(targetId);
        closeDeleteModal();
      }
    } catch (err) {
      setSyncIndicator('error', 'Lỗi xóa');
      showToast(err.message || 'Không thể xóa trên Gist.', true);
    } finally {
      state.busy = false;
      els.confirmDeleteBtn.disabled = false;
      els.confirmDeleteBtn.textContent = 'Xóa vĩnh viễn';
    }
  }

  /* ------------------------- SAO LƯU & CÀI ĐẶT ------------------------- */

  function openSettingsModal() {
    updateGistHeaderInfo();
    els.changePwForm.reset();
    els.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    els.settingsModal.classList.add('hidden');
  }

  async function handleExportEncrypted() {
    try {
      const envelope =
        state.lastEnvelope ||
        (await encryptVaultData(buildPlainVaultPayload(state.items), state.masterPassword));
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadJsonFile(`my-note-data-encrypted-${dateStr}.json`, envelope);
      showToast('Đã tải file data.json (Đã mã hóa).');
    } catch (err) {
      showToast(err.message || 'Không thể xuất file mã hóa.', true);
    }
  }

  function handleExportPlain() {
    const confirmed = window.confirm(
      'CẢNH BÁO: File JSON này chứa mật khẩu KHÔNG MÃ HÓA (dạng chữ thường).\n' +
        'Chỉ xuất khi bạn muốn xem trực tiếp hoặc chuyển dữ liệu. Tiếp tục?'
    );
    if (!confirmed) return;

    const dateStr = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`my-note-plain-backup-${dateStr}.json`, buildPlainVaultPayload(state.items));
    showToast('Đã xuất file JSON giải mã.');
  }

  async function handleImportFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file || state.busy) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      let importedRaw = parsed;

      const isEncrypted =
        parsed &&
        typeof parsed === 'object' &&
        (parsed.app === VAULT_MARKER || (parsed.salt && parsed.iv && parsed.ciphertext));

      if (isEncrypted) {
        try {
          importedRaw = await decryptVaultData(parsed, state.masterPassword);
        } catch (err) {
          if (err.code === 'WRONG_PASSWORD') {
            const altPassword = window.prompt(
              'File sao lưu này được mã hóa bằng Master Password khác.\nNhập Master Password của file để giải mã:'
            );
            if (!altPassword) return;
            importedRaw = await decryptVaultData(parsed, altPassword);
          } else {
            throw err;
          }
        }
      }

      const importedItems = normalizeVaultPayload(importedRaw);
      if (importedItems.length === 0) {
        showToast('File không chứa tài khoản nào để nhập.', true);
        return;
      }

      let nextItems = importedItems;
      if (state.items.length > 0) {
        const mergeConfirm = window.confirm(
          `Tìm thấy ${importedItems.length} tài khoản trong file.\n` +
            'Bấm OK để GỘP thêm vào danh sách hiện tại (bỏ qua mục trùng ID) và lưu lên Gist.'
        );
        if (!mergeConfirm) return;

        const existingIds = new Set(state.items.map((x) => x.id));
        const newOnes = importedItems.filter((x) => !existingIds.has(x.id));
        nextItems = [...newOnes, ...state.items];
      }

      state.busy = true;
      await persistItemsToGist(
        nextItems,
        `Đã khôi phục ${importedItems.length} mục và đồng bộ lên Gist.`
      );
      closeSettingsModal();
    } catch (err) {
      showToast(err.message || 'File JSON không hợp lệ hoặc sai mật khẩu.', true);
    } finally {
      state.busy = false;
    }
  }

  async function handleChangeMasterPassword(event) {
    event.preventDefault();
    if (state.busy) return;

    const newPw = els.newMasterPw.value;
    const confirmPw = els.confirmMasterPw.value;

    if (newPw.length < 4) {
      showToast('Master Password mới nên có ít nhất 4 ký tự.', true);
      return;
    }
    if (newPw !== confirmPw) {
      showToast('Hai lần nhập mật khẩu mới không khớp.', true);
      return;
    }

    state.busy = true;
    els.changePwSubmitBtn.disabled = true;
    els.changePwSubmitBtn.textContent = 'Đang mã hóa lại...';

    const oldPw = state.masterPassword;
    try {
      state.masterPassword = newPw;
      const saved = await persistItemsToGist(
        state.items,
        'Đã đổi Master Password và mã hóa lại data.json trên Gist!'
      );
      if (!saved) {
        state.masterPassword = oldPw;
      } else {
        els.changePwForm.reset();
      }
    } catch (err) {
      state.masterPassword = oldPw;
      setSyncIndicator('error', 'Lỗi cập nhật');
      showToast(err.message || 'Không thể cập nhật Master Password.', true);
    } finally {
      state.busy = false;
      els.changePwSubmitBtn.disabled = false;
      els.changePwSubmitBtn.textContent = 'Cập nhật khóa mã hóa';
    }
  }

  /* ------------------------- ĐĂNG KÝ SỰ KIỆN ------------------------- */

  function bindEvents() {
    els.authThemeBtn.addEventListener('click', toggleTheme);
    els.themeToggleBtn.addEventListener('click', toggleTheme);
    els.clearSavedTokenBtn.addEventListener('click', clearSavedCredentials);

    els.togglePatBtn.addEventListener('click', () =>
      toggleInputVisibility(els.patInput, els.togglePatBtn)
    );
    els.toggleMasterBtn.addEventListener('click', () =>
      toggleInputVisibility(els.masterPasswordInput, els.toggleMasterBtn)
    );
    els.toggleItemPwBtn.addEventListener('click', () =>
      toggleInputVisibility(els.itemPassword, els.toggleItemPwBtn)
    );

    els.authForm.addEventListener('submit', handleUnlock);
    els.syncBtn.addEventListener('click', syncFromGist);
    els.lockBtn.addEventListener('click', () => {
      lockVault();
      showToast('Đã khóa kho dữ liệu.');
    });

    els.searchInput.addEventListener('input', (e) => {
      state.search = e.target.value;
      renderItems();
    });

    els.categoryFilters.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      setActiveFilter(chip.dataset.filter || 'all');
    });

    els.dueBannerBtn.addEventListener('click', () => setActiveFilter('upcoming'));

    els.addItemBtn.addEventListener('click', () => openItemModal(null));
    els.emptyAddBtn.addEventListener('click', () => openItemModal(null));
    els.closeItemModalBtn.addEventListener('click', closeItemModal);
    els.cancelItemBtn.addEventListener('click', closeItemModal);
    els.itemForm.addEventListener('submit', handleSaveItem);

    els.itemRemindAt.addEventListener('input', syncModalReminderControls);
    els.clearRemindBtn.addEventListener('click', () => {
      els.itemRemindAt.value = '';
      els.itemRemindNote.value = '';
      syncModalReminderControls();
    });
    els.modalGcalBtn.addEventListener('click', () => {
      const remindAt = fromDatetimeLocalValue(els.itemRemindAt.value);
      if (!remindAt) {
        showToast('Vui lòng chọn Ngày & giờ nhắc trước.', true);
        return;
      }
      const gcalUrl = buildGoogleCalendarUrl({
        title: els.itemTitle.value.trim() || 'Tài khoản My Note',
        remindAt,
        remindNote: els.itemRemindNote.value.trim(),
      });
      if (gcalUrl) {
        window.open(gcalUrl, '_blank', 'noopener,noreferrer');
      }
    });

    els.genPwBtn.addEventListener('click', () => {
      els.itemPassword.value = generateStrongPassword(18);
      els.itemPassword.type = 'text';
      els.toggleItemPwBtn.textContent = 'Ẩn';
    });

    els.backupMenuBtn.addEventListener('click', openSettingsModal);
    els.closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
    els.copyGistIdBtn.addEventListener('click', () =>
      copyText(state.gistId, els.copyGistIdBtn)
    );
    els.exportEncryptedBtn.addEventListener('click', handleExportEncrypted);
    els.exportPlainBtn.addEventListener('click', handleExportPlain);
    els.importBtn.addEventListener('click', () => els.importFileInput.click());
    els.importFileInput.addEventListener('change', handleImportFile);
    els.changePwForm.addEventListener('submit', handleChangeMasterPassword);
    els.logoutForgetBtn.addEventListener('click', () => {
      clearSavedCredentials();
      lockVault();
    });

    els.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    els.confirmDeleteBtn.addEventListener('click', handleConfirmDelete);

    // Đóng modal khi click ra nền tối
    for (const modal of [els.itemModal, els.settingsModal, els.deleteModal]) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
          if (modal === els.deleteModal) state.pendingDeleteId = null;
        }
      });
    }

    // Phím tắt Esc và /
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!els.deleteModal.classList.contains('hidden')) {
          closeDeleteModal();
        } else if (!els.itemModal.classList.contains('hidden')) {
          closeItemModal();
        } else if (!els.settingsModal.classList.contains('hidden')) {
          closeSettingsModal();
        }
        return;
      }

      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag);
      if (
        e.key === '/' &&
        !isTyping &&
        !els.vaultView.classList.contains('hidden') &&
        els.itemModal.classList.contains('hidden') &&
        els.settingsModal.classList.contains('hidden')
      ) {
        e.preventDefault();
        els.searchInput.focus();
      }
    });
  }

  function init() {
    applyTheme(localStorage.getItem(STORAGE_KEYS.THEME) || 'dark');
    loadSavedCredentials();
    bindEvents();
  }

  init();
})();
