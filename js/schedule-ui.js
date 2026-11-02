let currentSchedule = null;
let currentAssignments = [];
let currentGrouped = [];
let editingAssignment = null;

async function initScheduleViewPage() {
    populateViewFilters();
    setupViewEvents();

    const params = new URLSearchParams(window.location.search);
    const year = params.get('year');
    const semester = params.get('semester');
    if (year && semester) {
        document.getElementById('filterYear').value = year;
        document.getElementById('filterSemester').value = semester;
        await loadSchedule(parseInt(year), parseInt(semester));
    }
}

function populateViewFilters() {
    const yearSelect = document.getElementById('filterYear');
    const semSelect = document.getElementById('filterSemester');
    if (!yearSelect || !semSelect) return;

    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let y = currentYear + 2; y >= currentYear - 2; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === currentYear) opt.selected = true;
        yearSelect.appendChild(opt);
    }

    const currentMonth = new Date().getMonth();
    semSelect.value = currentMonth < 6 ? '1' : '2';
}

function setupViewEvents() {
    const loadBtn = document.getElementById('loadScheduleBtn');
    if (loadBtn) {
        loadBtn.addEventListener('click', async () => {
            const year = parseInt(document.getElementById('filterYear').value);
            const semester = parseInt(document.getElementById('filterSemester').value);
            await loadSchedule(year, semester);
        });
    }

    const publishBtn = document.getElementById('publishBtn');
    if (publishBtn) {
        publishBtn.addEventListener('click', togglePublish);
    }

    const exportBtn = document.getElementById('exportPdfBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', handleExportPDF);
    }

    const deleteBtn = document.getElementById('deleteScheduleBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', handleDeleteSchedule);
    }

    const saveEditBtn = document.getElementById('saveEditBtn');
    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', saveAssignmentEdit);
    }

    document.querySelectorAll('#editModal .modal-close, #editModal .btn-cancel-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('editModal')?.classList.remove('active');
        });
    });

    const editModal = document.getElementById('editModal');
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) editModal.classList.remove('active');
        });
    }
}

async function loadSchedule(year, semester) {
    const infoEl = document.getElementById('scheduleInfo');
    const tableContainer = document.getElementById('scheduleTableContainer');
    const tbody = document.getElementById('scheduleTableBody');
    const validationPanel = document.getElementById('validationPanel');

    if (tableContainer) tableContainer.classList.remove('hidden');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:32px;"><div class="spinner" style="margin:0 auto;"></div></td></tr>';

    try {
        const { data: schedule, error: sErr } = await supabaseClient
            .from('schedules')
            .select('*')
            .eq('year', year)
            .eq('semester', semester)
            .maybeSingle();

        if (sErr || !schedule) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding:32px;">Belum ada jadwal untuk periode ini. <a href="schedule.html">Buat jadwal baru →</a></td></tr>';
            if (infoEl) infoEl.classList.add('hidden');
            if (validationPanel) validationPanel.classList.add('hidden');
            currentSchedule = null;
            return;
        }

        currentSchedule = schedule;

        const { data: assignments, error: aErr } = await supabaseClient
            .from('schedule_assignments')
            .select('*, members(id, name, gender, can_liturgos, can_kolektan, can_singer)')
            .eq('schedule_id', schedule.id)
            .order('service_date');

        if (aErr) throw aErr;
        currentAssignments = assignments || [];

        updateScheduleInfo(schedule);
        currentGrouped = groupAssignmentsByDate(currentAssignments);
        renderScheduleTable(currentGrouped);
        runValidation(currentGrouped);

    } catch (err) {
        console.error('Load schedule error:', err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Gagal memuat jadwal: ' + err.message + '</td></tr>';
    }
}

function updateScheduleInfo(schedule) {
    const infoEl = document.getElementById('scheduleInfo');
    const periodLabel = document.getElementById('schedulePeriodLabel');
    const statusBadge = document.getElementById('scheduleStatusBadge');
    const publishBtn = document.getElementById('publishBtn');

    if (infoEl) infoEl.classList.remove('hidden');

    const semLabel = schedule.semester === 1 ? 'Januari - Juni' : 'Juli - Desember';
    if (periodLabel) periodLabel.textContent = 'Periode ' + semLabel + ' ' + schedule.year;

    if (statusBadge) {
        if (schedule.status === 'published') {
            statusBadge.className = 'badge badge-success';
            statusBadge.textContent = 'Published';
        } else {
            statusBadge.className = 'badge badge-warning';
            statusBadge.textContent = 'Draft';
        }
    }

    if (publishBtn) {
        if (schedule.status === 'published') {
            publishBtn.innerHTML = '<span class="material-icons-outlined">unpublished</span> Unpublish';
            publishBtn.className = 'btn btn-warning btn-sm';
        } else {
            publishBtn.innerHTML = '<span class="material-icons-outlined">publish</span> Publish';
            publishBtn.className = 'btn btn-success btn-sm';
        }
    }
}

function groupAssignmentsByDate(assignments) {
    const map = {};
    assignments.forEach(a => {
        const date = a.service_date;
        if (!map[date]) {
            map[date] = { service_date: date, Liturgos: [], Kolektan: [], Singer: [] };
        }
        map[date][a.role].push({
            assignmentId: a.id,
            memberId: a.members?.id || a.member_id,
            name: a.members?.name || 'Unknown',
            gender: a.members?.gender || '?'
        });
    });
    return Object.values(map).sort((a, b) => a.service_date.localeCompare(b.service_date));
}

function renderScheduleTable(grouped) {
    const tbody = document.getElementById('scheduleTableBody');
    if (!tbody) return;

    if (grouped.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding:32px;">Tidak ada data penugasan</td></tr>';
        return;
    }

    tbody.innerHTML = grouped.map((row, i) => {
        const liturgosHtml = renderRoleCell(row.Liturgos, row.service_date, 'Liturgos');
        const kolektanHtml = renderRoleCell(row.Kolektan, row.service_date, 'Kolektan');
        const singerHtml = renderRoleCell(row.Singer, row.service_date, 'Singer');

        return '<tr>' +
            '<td class="text-center">' + (i + 1) + '</td>' +
            '<td style="white-space:nowrap;">' + formatDateIndonesian(row.service_date) + '</td>' +
            '<td class="schedule-cell">' + liturgosHtml + '</td>' +
            '<td class="schedule-cell">' + kolektanHtml + '</td>' +
            '<td class="schedule-cell">' + singerHtml + '</td>' +
            '</tr>';
    }).join('');
}

function renderRoleCell(members, date, role) {
    if (!members || members.length === 0) {
        return '<span class="text-danger">⚠ Kosong</span>';
    }

    return members.map(m => {
        const genderIcon = m.gender === 'L' ? '♂' : '♀';
        return '<div class="schedule-name">' +
            '<span>' + genderIcon + ' ' + escapeHtml(m.name) + '</span>' +
            ' <button class="edit-trigger" onclick="openEditModal(\'' + m.assignmentId + '\')" title="Edit">' +
                '<span class="material-icons-outlined" style="font-size:14px;">edit</span>' +
            '</button>' +
            '</div>';
    }).join('');
}

async function openEditModal(assignmentId) {
    const modal = document.getElementById('editModal');
    const dateEl = document.getElementById('editDate');
    const roleEl = document.getElementById('editRole');
    const currentEl = document.getElementById('editCurrentMember');
    const selectEl = document.getElementById('editNewMember');

    if (!modal || !selectEl) return;

    const assignment = currentAssignments.find(a => a.id === assignmentId);
    if (!assignment) return;

    const date = assignment.service_date;
    const role = assignment.role;
    const currentName = assignment.members?.name || 'Unknown';

    editingAssignment = assignmentId;

    if (dateEl) dateEl.textContent = formatDateIndonesian(date);
    if (roleEl) roleEl.textContent = role;
    if (currentEl) currentEl.textContent = currentName;

    selectEl.innerHTML = '<option value="">Memuat...</option>';
    modal.classList.add('active');

    try {
        const capField = 'can_' + role.toLowerCase();
        const { data: members, error } = await supabaseClient
            .from('members')
            .select('*')
            .eq(capField, true)
            .order('name');

        if (error) throw error;

        const assignedOnDate = currentAssignments
            .filter(a => a.service_date === date && a.id !== assignmentId)
            .map(a => a.member_id);

        const eligible = (members || []).filter(m => !assignedOnDate.includes(m.id));

        selectEl.innerHTML = '<option value="">— Pilih anggota —</option>' +
            eligible.map(m => {
                const g = m.gender === 'L' ? '♂' : '♀';
                return '<option value="' + m.id + '">' + g + ' ' + m.name + '</option>';
            }).join('');

    } catch (err) {
        console.error('Load eligible members error:', err);
        selectEl.innerHTML = '<option value="">Gagal memuat</option>';
    }
}

async function saveAssignmentEdit() {
    const selectEl = document.getElementById('editNewMember');
    const newMemberId = selectEl?.value;

    if (!newMemberId || !editingAssignment) {
        showToast('Pilih anggota terlebih dahulu', 'error');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('schedule_assignments')
            .update({ member_id: newMemberId })
            .eq('id', editingAssignment);

        if (error) throw error;

        showToast('Penugasan berhasil diperbarui', 'success');
        document.getElementById('editModal')?.classList.remove('active');
        editingAssignment = null;

        if (currentSchedule) {
            await loadSchedule(currentSchedule.year, currentSchedule.semester);
        }

    } catch (err) {
        console.error('Save edit error:', err);
        showToast('Gagal memperbarui: ' + err.message, 'error');
    }
}

async function togglePublish() {
    if (!currentSchedule) return;

    const newStatus = currentSchedule.status === 'published' ? 'draft' : 'published';
    const action = newStatus === 'published' ? 'mempublikasikan' : 'membatalkan publikasi';

    if (!confirm('Apakah Anda yakin ingin ' + action + ' jadwal ini?')) return;

    try {
        const { error } = await supabaseClient
            .from('schedules')
            .update({ status: newStatus })
            .eq('id', currentSchedule.id);

        if (error) throw error;

        showToast('Jadwal berhasil di-' + (newStatus === 'published' ? 'publish' : 'unpublish'), 'success');
        await loadSchedule(currentSchedule.year, currentSchedule.semester);

    } catch (err) {
        console.error('Publish error:', err);
        showToast('Gagal: ' + err.message, 'error');
    }
}

function handleExportPDF() {
    if (!currentSchedule || currentGrouped.length === 0) {
        showToast('Tidak ada data untuk diekspor', 'error');
        return;
    }

    const pdfData = currentGrouped.map(row => ({
        service_date: row.service_date,
        liturgos: row.Liturgos.map(m => m.name).join(', '),
        kolektan: row.Kolektan.map(m => m.name),
        singer: row.Singer.map(m => m.name)
    }));

    if (typeof exportSchedulePDF === 'function') {
        exportSchedulePDF(pdfData, currentSchedule.year, currentSchedule.semester);
        showToast('PDF berhasil diunduh', 'success');
    } else {
        showToast('Modul PDF belum dimuat', 'error');
    }
}

async function handleDeleteSchedule() {
    if (!currentSchedule) return;

    if (!confirm('PERINGATAN: Jadwal ini akan dihapus beserta seluruh penugasannya. Lanjutkan?')) return;

    try {
        const { error } = await supabaseClient
            .from('schedules')
            .delete()
            .eq('id', currentSchedule.id);

        if (error) throw error;

        showToast('Jadwal berhasil dihapus', 'success');
        currentSchedule = null;
        currentAssignments = [];
        currentGrouped = [];

        const infoEl = document.getElementById('scheduleInfo');
        const tableContainer = document.getElementById('scheduleTableContainer');
        const validationPanel = document.getElementById('validationPanel');
        if (infoEl) infoEl.classList.add('hidden');
        if (tableContainer) tableContainer.classList.add('hidden');
        if (validationPanel) validationPanel.classList.add('hidden');

    } catch (err) {
        console.error('Delete schedule error:', err);
        showToast('Gagal menghapus: ' + err.message, 'error');
    }
}

function runValidation(grouped) {
    const panel = document.getElementById('validationPanel');
    const list = document.getElementById('validationList');
    if (!panel || !list) return;

    panel.classList.remove('hidden');
    const checks = [];

    let allFilled = true;
    let emptySlots = 0;
    grouped.forEach(row => {
        if (row.Liturgos.length < 1) { allFilled = false; emptySlots++; }
        if (row.Kolektan.length < 2) { allFilled = false; emptySlots += (2 - row.Kolektan.length); }
        if (row.Singer.length < 3) { allFilled = false; emptySlots += (3 - row.Singer.length); }
    });
    checks.push({
        status: allFilled ? 'pass' : 'fail',
        text: allFilled ? 'Semua posisi terisi' : emptySlots + ' slot kosong ditemukan'
    });

    let noDuplicates = true;
    grouped.forEach(row => {
        const ids = [...row.Liturgos, ...row.Kolektan, ...row.Singer].map(m => m.memberId);
        const unique = new Set(ids);
        if (unique.size !== ids.length) noDuplicates = false;
    });
    checks.push({
        status: noDuplicates ? 'pass' : 'fail',
        text: noDuplicates ? 'Tidak ada penugasan ganda per minggu' : 'Ditemukan anggota dengan tugas ganda pada hari yang sama'
    });

    let kolektanGenderOk = true;
    grouped.forEach(row => {
        if (row.Kolektan.length === 2) {
            const genders = row.Kolektan.map(m => m.gender);
            if (!genders.includes('L') || !genders.includes('P')) kolektanGenderOk = false;
        }
    });
    checks.push({
        status: kolektanGenderOk ? 'pass' : 'warn',
        text: kolektanGenderOk ? 'Gender Kolektan sesuai (1L + 1P)' : 'Ada Kolektan yang tidak memenuhi aturan gender'
    });

    let singerGenderOk = true;
    grouped.forEach(row => {
        if (row.Singer.length === 3) {
            const males = row.Singer.filter(m => m.gender === 'L').length;
            const females = row.Singer.filter(m => m.gender === 'P').length;
            if (!((males === 1 && females === 2) || (males === 2 && females === 1))) {
                singerGenderOk = false;
            }
        }
    });
    checks.push({
        status: singerGenderOk ? 'pass' : 'warn',
        text: singerGenderOk ? 'Gender Singer sesuai (campuran L & P)' : 'Ada Singer yang tidak memenuhi aturan gender'
    });

    const roleCounts = {};
    grouped.forEach(row => {
        ['Liturgos', 'Kolektan', 'Singer'].forEach(role => {
            row[role].forEach(m => {
                if (!roleCounts[m.memberId]) roleCounts[m.memberId] = { Liturgos: 0, Kolektan: 0, Singer: 0 };
                roleCounts[m.memberId][role]++;
            });
        });
    });
    let repeats = 0;
    Object.values(roleCounts).forEach(rc => {
        ['Liturgos', 'Kolektan', 'Singer'].forEach(role => {
            if (rc[role] > 1) repeats += (rc[role] - 1);
        });
    });
    checks.push({
        status: repeats === 0 ? 'pass' : 'warn',
        text: repeats === 0 ? 'Tidak ada pengulangan posisi dalam periode' : repeats + ' pengulangan posisi ditemukan'
    });

    const iconMap = { pass: 'check_circle', fail: 'cancel', warn: 'warning' };
    list.innerHTML = checks.map(c => {
        return '<div class="validation-item validation-' + c.status + '">' +
            '<span class="material-icons-outlined">' + iconMap[c.status] + '</span>' +
            '<span>' + c.text + '</span>' +
            '</div>';
    }).join('');
}

function formatDateIndonesian(dateStr) {
    if (!dateStr) return '-';
    let year, month, day;
    if (typeof dateStr === 'string') {
        const parts = dateStr.split('T')[0].split('-');
        if (parts.length === 3) {
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            day = parseInt(parts[2], 10);
        }
    }
    if (year === undefined) {
        const d = new Date(dateStr);
        year = d.getFullYear();
        month = d.getMonth();
        day = d.getDate();
    }
    const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return 'Minggu, ' + day + ' ' + months[month] + ' ' + year;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

if (typeof showToast === 'undefined') {
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
            (iconMap[type] || 'info') + '</span><span>' + message + '</span>';
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }
}
