let parsedImportData = [];

function initImportModal() {
    const importBtn = document.getElementById('importExcelBtn');
    const importModal = document.getElementById('importModal');
    const importFile = document.getElementById('importFile');
    const confirmBtn = document.getElementById('confirmImportBtn');
    const cancelBtns = importModal ? importModal.querySelectorAll('.modal-close, .btn-cancel-import') : [];

    if (!importBtn || !importModal) return;

    importBtn.addEventListener('click', () => {
        parsedImportData = [];
        if (importFile) importFile.value = '';
        const preview = document.getElementById('importPreview');
        if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
        if (confirmBtn) confirmBtn.disabled = true;
        importModal.classList.add('active');
    });

    cancelBtns.forEach(btn => {
        btn.addEventListener('click', () => importModal.classList.remove('active'));
    });
    importModal.addEventListener('click', (e) => {
        if (e.target === importModal) importModal.classList.remove('active');
    });

    if (importFile) {
        importFile.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                parsedImportData = await parseExcelFile(file);
                showImportPreview(parsedImportData);
                if (confirmBtn) confirmBtn.disabled = parsedImportData.filter(m => m.isValid).length === 0;
            } catch (err) {
                console.error('Parse error:', err);
                const preview = document.getElementById('importPreview');
                if (preview) {
                    preview.classList.remove('hidden');
                    preview.innerHTML = '<div class="alert alert-danger">Gagal membaca file: ' + err.message + '</div>';
                }
            }
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const validMembers = parsedImportData.filter(m => m.isValid);
            if (validMembers.length === 0) return;

            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Mengimpor...';

            try {
                const insertData = validMembers.map(m => ({
                    name: m.name,
                    gender: m.gender,
                    can_liturgos: m.can_liturgos,
                    can_kolektan: m.can_kolektan,
                    can_singer: m.can_singer
                }));

                const { error } = await supabaseClient.from('members').insert(insertData);
                if (error) throw error;

                const skipped = parsedImportData.length - validMembers.length;
                showToast(validMembers.length + ' anggota berhasil diimpor' + (skipped > 0 ? ', ' + skipped + ' dilewati' : ''), 'success');

                importModal.classList.remove('active');
                if (typeof initMembersPage === 'function') await initMembersPage();
            } catch (err) {
                console.error('Import error:', err);
                showToast('Gagal mengimpor data: ' + err.message, 'error');
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<span class="material-icons-outlined">upload</span> Import';
            }
        });
    }
}

async function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) {
                    resolve([]);
                    return;
                }

                const members = jsonData.map((row, idx) => {
                    const name = findValue(row, ['Nama', 'Name', 'nama', 'name', 'NAMA']) || '';
                    const genderRaw = findValue(row, ['Gender', 'JK', 'Jenis Kelamin', 'gender', 'jk', 'GENDER', 'Jenis_Kelamin']) || '';
                    const gender = normalizeGender(genderRaw);

                    const can_liturgos = toBool(findValue(row, ['Liturgos', 'liturgos', 'LITURGOS', 'Can_Liturgos']));
                    const can_kolektan = toBool(findValue(row, ['Kolektan', 'kolektan', 'KOLEKTAN', 'Can_Kolektan']));
                    const can_singer = toBool(findValue(row, ['Singer', 'singer', 'SINGER', 'Can_Singer', 'Penyanyi']));

                    const hasCapability = can_liturgos || can_kolektan || can_singer;
                    const validGender = ['L', 'P'].includes(gender);
                    const validName = name.trim() !== '';

                    return {
                        rowNum: idx + 2,
                        name: name.trim(),
                        gender,
                        can_liturgos,
                        can_kolektan,
                        can_singer,
                        isValid: validName && validGender && hasCapability,
                        errors: [
                            ...(!validName ? ['Nama kosong'] : []),
                            ...(!validGender ? ['Gender tidak valid'] : []),
                            ...(!hasCapability ? ['Tidak ada kemampuan'] : [])
                        ]
                    };
                });

                resolve(members);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Gagal membaca file'));
        reader.readAsArrayBuffer(file);
    });
}

function findValue(row, possibleKeys) {
    for (const key of possibleKeys) {
        if (row[key] !== undefined && row[key] !== null) return row[key];
    }
    const rowKeys = Object.keys(row);
    for (const possible of possibleKeys) {
        const found = rowKeys.find(k => k.toLowerCase().trim() === possible.toLowerCase().trim());
        if (found && row[found] !== undefined) return row[found];
    }
    return undefined;
}

function normalizeGender(val) {
    const s = String(val).trim().toUpperCase();
    if (['L', 'LAKI-LAKI', 'LAKI', 'M', 'MALE'].includes(s)) return 'L';
    if (['P', 'PEREMPUAN', 'F', 'FEMALE', 'W', 'WANITA'].includes(s)) return 'P';
    return '';
}

function toBool(val) {
    if (val === undefined || val === null) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val === 1;
    const s = String(val).trim().toLowerCase();
    return ['1', 'true', 'ya', 'yes', 'y', '✓', 'v'].includes(s);
}

function showImportPreview(members) {
    const preview = document.getElementById('importPreview');
    if (!preview) return;

    const valid = members.filter(m => m.isValid);
    const invalid = members.filter(m => !m.isValid);

    let html = '<div class="mb-2" style="font-size:14px;">';
    html += '<span class="badge badge-success">' + valid.length + ' valid</span> ';
    if (invalid.length > 0) {
        html += '<span class="badge badge-danger">' + invalid.length + ' tidak valid</span>';
    }
    html += '</div>';

    html += '<div class="table-container"><table class="data-table"><thead><tr>';
    html += '<th>Baris</th><th>Nama</th><th>Gender</th><th>L</th><th>K</th><th>S</th><th>Status</th>';
    html += '</tr></thead><tbody>';

    members.forEach(m => {
        const rowClass = m.isValid ? '' : 'style="background:#fed7d7;"';
        html += '<tr ' + rowClass + '>';
        html += '<td>' + m.rowNum + '</td>';
        html += '<td>' + escapeHtml(m.name || '-') + '</td>';
        html += '<td>' + (m.gender || '?') + '</td>';
        html += '<td>' + (m.can_liturgos ? '✓' : '-') + '</td>';
        html += '<td>' + (m.can_kolektan ? '✓' : '-') + '</td>';
        html += '<td>' + (m.can_singer ? '✓' : '-') + '</td>';
        html += '<td>' + (m.isValid
            ? '<span class="text-success">✓</span>'
            : '<span class="text-danger">' + m.errors.join(', ') + '</span>') + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table></div>';

    preview.innerHTML = html;
    preview.classList.remove('hidden');
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
