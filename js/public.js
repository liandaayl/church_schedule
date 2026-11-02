async function initPublicPage() {
    const churchNameEl = document.getElementById('publicChurchName');
    if (churchNameEl && window.APP_CONFIG) {
        churchNameEl.textContent = APP_CONFIG.churchName || 'Gereja';
    }

    await populatePublicFilters();

    const loadBtn = document.getElementById('loadPublicBtn');
    if (loadBtn) {
        loadBtn.addEventListener('click', () => {
            const year = parseInt(document.getElementById('publicYear').value);
            const semester = parseInt(document.getElementById('publicSemester').value);
            if (year && semester) loadPublicSchedule(year, semester);
        });
    }
}

async function populatePublicFilters() {
    const yearSelect = document.getElementById('publicYear');
    const semSelect = document.getElementById('publicSemester');
    if (!yearSelect || !semSelect) return;

    try {
        const { data: schedules, error } = await supabaseClient
            .from('schedules')
            .select('year, semester')
            .eq('status', 'published')
            .order('year', { ascending: false });

        if (error) throw error;

        if (!schedules || schedules.length === 0) {
            yearSelect.innerHTML = '<option value="">Tidak ada jadwal</option>';
            semSelect.innerHTML = '<option value="">-</option>';
            showPublicEmpty();
            return;
        }

        const years = [...new Set(schedules.map(s => s.year))].sort((a, b) => b - a);

        yearSelect.innerHTML = years.map(y =>
            '<option value="' + y + '">' + y + '</option>'
        ).join('');

        semSelect.innerHTML =
            '<option value="1">Semester 1 (Jan - Jun)</option>' +
            '<option value="2">Semester 2 (Jul - Des)</option>';

        const latest = schedules[0];
        yearSelect.value = latest.year;
        semSelect.value = latest.semester;

        await loadPublicSchedule(latest.year, latest.semester);

    } catch (err) {
        console.error('Error loading filters:', err);
        const currentYear = new Date().getFullYear();
        yearSelect.innerHTML = '';
        for (let y = currentYear + 1; y >= currentYear - 2; y--) {
            yearSelect.innerHTML += '<option value="' + y + '">' + y + '</option>';
        }
        yearSelect.value = currentYear;
    }
}

async function loadPublicSchedule(year, semester) {
    const tableContainer = document.getElementById('publicTableContainer');
    const tbody = document.getElementById('publicTableBody');
    const emptyState = document.getElementById('publicEmptyState');
    const periodLabel = document.getElementById('publicPeriodLabel');

    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:24px;"><div class="spinner" style="margin:0 auto;"></div></td></tr>';
    if (tableContainer) tableContainer.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    try {
        let grouped = [];
        const { data: viewData, error: viewError } = await supabaseClient
            .from('public_schedule_view')
            .select('*')
            .eq('schedule_year', year)
            .eq('schedule_semester', semester)
            .order('service_date');

        if (!viewError && viewData && viewData.length > 0) {
            grouped = groupByDateFromView(viewData);
        } else {
            const { data: schedule, error: schedError } = await supabaseClient
                .from('schedules')
                .select('*')
                .eq('year', year)
                .eq('semester', semester)
                .eq('status', 'published')
                .maybeSingle();

            if (schedError || !schedule) {
                showPublicEmpty();
                if (tableContainer) tableContainer.classList.add('hidden');
                return;
            }

            const { data: assignments, error: assgnError } = await supabaseClient
                .from('schedule_assignments')
                .select('*, members(name)')
                .eq('schedule_id', schedule.id)
                .order('service_date');

            if (assgnError || !assignments || assignments.length === 0) {
                showPublicEmpty();
                if (tableContainer) tableContainer.classList.add('hidden');
                return;
            }

            grouped = groupByDate(assignments);
        }

        if (!grouped || grouped.length === 0) {
            showPublicEmpty();
            if (tableContainer) tableContainer.classList.add('hidden');
            return;
        }

        const semLabel = semester === 1 ? 'Januari - Juni' : 'Juli - Desember';
        if (periodLabel) {
            periodLabel.textContent = 'Jadwal Pelayanan Periode ' + semLabel + ' ' + year;
            periodLabel.classList.remove('hidden');
        }

        renderPublicTable(grouped);

    } catch (err) {
        console.error('Load public schedule error:', err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger" style="padding:24px;">Gagal memuat jadwal</td></tr>';
    }
}

function groupByDate(assignments) {
    const map = {};
    assignments.forEach(a => {
        const date = a.service_date;
        if (!map[date]) {
            map[date] = { service_date: date, Liturgos: [], Kolektan: [], Singer: [] };
        }
        const memberName = a.members ? a.members.name : 'Unknown';
        if (map[date][a.role]) {
            map[date][a.role].push(memberName);
        }
    });
    return Object.values(map).sort((a, b) => a.service_date.localeCompare(b.service_date));
}

function groupByDateFromView(viewRows) {
    const map = {};
    viewRows.forEach(row => {
        const date = row.service_date;
        if (!map[date]) {
            map[date] = { service_date: date, Liturgos: [], Kolektan: [], Singer: [] };
        }
        if (map[date][row.role]) {
            map[date][row.role].push(row.member_name);
        }
    });
    return Object.values(map).sort((a, b) => a.service_date.localeCompare(b.service_date));
}

function renderPublicTable(grouped) {
    const tbody = document.getElementById('publicTableBody');
    if (!tbody) return;

    tbody.innerHTML = grouped.map((row, i) => {
        return '<tr>' +
            '<td class="text-center">' + (i + 1) + '</td>' +
            '<td>' + formatPublicDate(row.service_date) + '</td>' +
            '<td>' + (row.Liturgos.map(escapePublicHtml).join(', ') || '-') + '</td>' +
            '<td>' + (row.Singer.map(escapePublicHtml).join(', ') || '-') + '</td>' +
            '<td>' + (row.Kolektan.map(escapePublicHtml).join(', ') || '-') + '</td>' +
            '</tr>';
    }).join('');
}

function showPublicEmpty() {
    const tableContainer = document.getElementById('publicTableContainer');
    const emptyState = document.getElementById('publicEmptyState');
    const periodLabel = document.getElementById('publicPeriodLabel');
    if (tableContainer) tableContainer.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    if (periodLabel) periodLabel.classList.add('hidden');
}

function formatPublicDate(dateStr) {
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
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const dayName = days[new Date(year, month, day).getDay()];
    return dayName + ', ' + day + ' ' + months[month] + ' ' + year;
}

function escapePublicHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    initPublicPage();
});
