let allMembers = [];
let currentEditId = null;
let currentDeleteId = null;

async function loadMembers() {
    try {
        const { data, error } = await supabaseClient
            .from('members')
            .select('*')
            .order('name');
        if (error) throw error;
        allMembers = data || [];
        return allMembers;
    } catch (err) {
        console.error('Load members error:', err);
        showToast('Gagal memuat data anggota', 'error');
        return [];
    }
}

async function initMembersPage() {
    const members = await loadMembers();
    renderMembersTable(members);
    setupMemberEvents();
}

function renderMembersTable(members) {
    const tbody = document.getElementById('membersTableBody');
    const countEl = document.getElementById('memberCount');
    if (!tbody) return;

    if (countEl) countEl.textContent = members.length + ' anggota';

    if (members.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:32px;">Belum ada data anggota. Klik "Tambah Anggota" untuk memulai.</td></tr>';
        return;
    }

    tbody.innerHTML = members.map((m, i) => {
        const genderClass = m.gender === 'L' ? 'male' : 'female';
        const genderLabel = m.gender === 'L' ? 'Laki-laki' : 'Perempuan';

        let capabilities = '';
        if (m.can_liturgos) capabilities += '<span class="tag tag-liturgos">Liturgos</span>';
        if (m.can_kolektan) capabilities += '<span class="tag tag-kolektan">Kolektan</span>';
        if (m.can_singer) capabilities += '<span class="tag tag-singer">Singer</span>';
        if (!capabilities) capabilities = '<span class="text-muted">-</span>';

        const partner = m.partner_id ? allMembers.find(p => p.id === m.partner_id) : null;
        const partnerName = partner ? escapeHtml(partner.name) : '<span class="text-muted">-</span>';

        return '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td><strong>' + escapeHtml(m.name) + '</strong></td>' +
            '<td><span class="gender-tag ' + genderClass + '">' + genderLabel + '</span></td>' +
            '<td>' + (m.can_liturgos ? '<span class="text-success">✓</span>' : '<span class="text-muted">-</span>') + '</td>' +
            '<td>' + (m.can_kolektan ? '<span class="text-success">✓</span>' : '<span class="text-muted">-</span>') + '</td>' +
            '<td>' + (m.can_singer ? '<span class="text-success">✓</span>' : '<span class="text-muted">-</span>') + '</td>' +
            '<td>' + partnerName + '</td>' +
            '<td><div class="table-actions">' +
                '<button class="btn btn-sm btn-icon btn-secondary" onclick="editMember(\'' + m.id + '\')" title="Edit">' +
                    '<span class="material-icons-outlined" style="font-size:16px;">edit</span></button>' +
                '<button class="btn btn-sm btn-icon btn-secondary" onclick="deleteMember(\'' + m.id + '\')" title="Hapus">' +
                    '<span class="material-icons-outlined" style="font-size:16px;color:var(--danger);">delete</span></button>' +
            '</div></td>' +
            '</tr>';
    }).join('');
}

function setupMemberEvents() {
    const addBtn = document.getElementById('addMemberBtn');
    if (addBtn && !addBtn._bound) {
        addBtn._bound = true;
        addBtn.addEventListener('click', () => openMemberModal());
    }

    const form = document.getElementById('memberForm');
    if (form && !form._bound) {
        form._bound = true;
        form.addEventListener('submit', saveMember);
    }

    document.querySelectorAll('.modal-close, .btn-cancel-member').forEach(btn => {
        if (!btn._bound) {
            btn._bound = true;
            btn.addEventListener('click', () => {
                document.getElementById('memberModal')?.classList.remove('active');
            });
        }
    });

    const confirmDelete = document.getElementById('confirmDeleteBtn');
    if (confirmDelete && !confirmDelete._bound) {
        confirmDelete._bound = true;
        confirmDelete.addEventListener('click', confirmDeleteMember);
    }

    document.querySelectorAll('.btn-cancel-delete').forEach(btn => {
        if (!btn._bound) {
            btn._bound = true;
            btn.addEventListener('click', () => {
                document.getElementById('deleteModal')?.classList.remove('active');
            });
        }
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput && !searchInput._bound) {
        searchInput._bound = true;
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = allMembers.filter(m => m.name.toLowerCase().includes(query));
            renderMembersTable(filtered);
        });
    }

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        if (!overlay._bound) {
            overlay._bound = true;
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.classList.remove('active');
            });
        }
    });

    if (typeof initImportModal === 'function') {
        initImportModal();
    }
}

function openMemberModal(member = null) {
    const modal = document.getElementById('memberModal');
    const title = document.getElementById('memberModalTitle');
    const idField = document.getElementById('memberId');
    const nameField = document.getElementById('memberName');
    const genderField = document.getElementById('memberGender');
    const cbL = document.getElementById('cbLiturgos');
    const cbK = document.getElementById('cbKolektan');
    const cbS = document.getElementById('cbSinger');
    const partnerSelect = document.getElementById('memberPartner');

    if (!modal) return;

    if (partnerSelect) {
        partnerSelect.innerHTML = '<option value="">— Tidak ada / Belum dipilih —</option>' +
            allMembers
                .filter(m => !member || m.id !== member.id)
                .map(m => '<option value="' + m.id + '"' + (member && member.partner_id === m.id ? ' selected' : '') + '>' + escapeHtml(m.name) + ' (' + m.gender + ')</option>')
                .join('');
    }

    if (member) {
        title.textContent = 'Edit Anggota';
        idField.value = member.id;
        nameField.value = member.name;
        genderField.value = member.gender;
        cbL.checked = member.can_liturgos;
        cbK.checked = member.can_kolektan;
        cbS.checked = member.can_singer;
        if (partnerSelect) partnerSelect.value = member.partner_id || '';
    } else {
        title.textContent = 'Tambah Anggota';
        idField.value = '';
        nameField.value = '';
        genderField.value = 'L';
        cbL.checked = false;
        cbK.checked = false;
        cbS.checked = false;
        if (partnerSelect) partnerSelect.value = '';
    }

    modal.classList.add('active');
    nameField.focus();
}

function editMember(id) {
    const member = allMembers.find(m => m.id === id);
    if (member) openMemberModal(member);
}

function deleteMember(id) {
    const member = allMembers.find(m => m.id === id);
    if (!member) return;
    currentDeleteId = id;
    const modal = document.getElementById('deleteModal');
    const nameEl = document.getElementById('deleteMemberName');
    if (nameEl) nameEl.textContent = member.name;
    if (modal) modal.classList.add('active');
}

async function saveMember(e) {
    e.preventDefault();

    const id = document.getElementById('memberId').value;
    const name = document.getElementById('memberName').value.trim();
    const gender = document.getElementById('memberGender').value;
    const can_liturgos = document.getElementById('cbLiturgos').checked;
    const can_kolektan = document.getElementById('cbKolektan').checked;
    const can_singer = document.getElementById('cbSinger').checked;
    const partner_id = document.getElementById('memberPartner')?.value || null;

    if (!name) {
        showToast('Nama tidak boleh kosong', 'error');
        return;
    }
    if (!can_liturgos && !can_kolektan && !can_singer) {
        showToast('Pilih minimal satu kemampuan pelayanan', 'error');
        return;
    }

    const data = { name, gender, can_liturgos, can_kolektan, can_singer, partner_id };

    try {
        if (id) {
            const oldMember = allMembers.find(m => m.id === id);
            const { error } = await supabaseClient.from('members').update(data).eq('id', id);
            if (error) throw error;

            if (oldMember && oldMember.partner_id && oldMember.partner_id !== partner_id) {
                await supabaseClient.from('members').update({ partner_id: null }).eq('id', oldMember.partner_id);
            }
            if (partner_id) {
                await supabaseClient.from('members').update({ partner_id: id }).eq('id', partner_id);
            }
            showToast('Anggota berhasil diperbarui', 'success');
        } else {
            const { data: inserted, error } = await supabaseClient.from('members').insert(data).select().single();
            if (error) throw error;
            if (partner_id && inserted) {
                await supabaseClient.from('members').update({ partner_id: inserted.id }).eq('id', partner_id);
            }
            showToast('Anggota berhasil ditambahkan', 'success');
        }

        document.getElementById('memberModal')?.classList.remove('active');
        await initMembersPage();
    } catch (err) {
        console.error('Save member error:', err);
        showToast('Gagal menyimpan: ' + err.message, 'error');
    }
}

async function confirmDeleteMember() {
    if (!currentDeleteId) return;

    try {
        const memberToDelete = allMembers.find(m => m.id === currentDeleteId);
        if (memberToDelete?.partner_id) {
            await supabaseClient.from('members').update({ partner_id: null }).eq('id', memberToDelete.partner_id);
        }

        const { error } = await supabaseClient.from('members').delete().eq('id', currentDeleteId);
        if (error) {
            if (error.code === '23503' || error.message?.includes('violates foreign key constraint')) {
                throw new Error('Anggota ini tidak dapat dihapus karena sudah memiliki riwayat tugas dalam jadwal ibadah. Hapus atau sesuaikan penugasan terkait terlebih dahulu.');
            }
            throw error;
        }

        showToast('Anggota berhasil dihapus', 'success');
        document.getElementById('deleteModal')?.classList.remove('active');
        currentDeleteId = null;
        await initMembersPage();
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Gagal menghapus: ' + err.message, 'error');
    }
}

function showToast(message, type) {
    type = type || 'success';
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const iconMap = { success: 'check_circle', error: 'error', info: 'info' };
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML =
        '<span class="material-icons-outlined" style="color:var(--' + (type === 'error' ? 'danger' : type) + ');">' +
        (iconMap[type] || 'info') + '</span>' +
        '<span>' + message + '</span>';
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
