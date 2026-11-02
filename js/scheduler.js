function getEasterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

function toDateString(d) {
    if (typeof d === 'string') return d.split('T')[0];
    return formatDate(d);
}

function getAllAnnualServiceDates(year) {
    const datesMap = new Map();

    function addDate(d, label) {
        const key = formatDate(d);
        if (!datesMap.has(key)) {
            datesMap.set(key, { date: new Date(d), dateStr: key, label });
        } else {
            datesMap.get(key).label += ' & ' + label;
        }
    }

    const curr = new Date(year, 0, 1);
    while (curr.getFullYear() === year) {
        if (curr.getDay() === 0) {
            addDate(curr, 'Ibadah Minggu');
        }
        curr.setDate(curr.getDate() + 1);
    }

    addDate(new Date(year, 0, 1), 'Ibadah Tahun Baru');

    const easter = getEasterSunday(year);
    const goodFriday = new Date(easter);
    goodFriday.setDate(easter.getDate() - 2);
    addDate(goodFriday, 'Jumat Agung');

    const easterMonday = new Date(easter);
    easterMonday.setDate(easter.getDate() + 1);
    addDate(easterMonday, 'Senin Paskah');

    addDate(new Date(year, 11, 24), 'Ibadah Menjelang Natal');
    addDate(new Date(year, 11, 25), 'Hari Natal');
    addDate(new Date(year, 11, 26), 'Ibadah Setelah Natal');
    addDate(new Date(year, 11, 31), 'Ibadah Akhir Tahun');

    const allDates = Array.from(datesMap.values()).sort((a, b) => a.date - b.date);
    allDates.forEach((item, idx) => {
        item.annualIndex = idx;
        item.liturgosGender = (idx % 3 === 0) ? 'L' : 'P';
    });

    return allDates;
}

function getServiceDatesInPeriod(year, semester) {
    const all = getAllAnnualServiceDates(year);
    return all.filter(d => semester === 1 ? d.date.getMonth() < 6 : d.date.getMonth() >= 6);
}

function scoreCandidate(member, role, assignmentCounts, lastAssignmentDate, currentDate, totalMembers, totalAssignmentsSoFar, dateAssignments, dateStr, previousDateRoles) {
    let score = 0;

    const myCount = assignmentCounts[member.id] || 0;
    const avgCount = totalMembers > 0 ? totalAssignmentsSoFar / totalMembers : 0;
    score += (avgCount - myCount) * 12;

    const lastDate = lastAssignmentDate[member.id];
    if (lastDate) {
        const daysSince = (currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        score += Math.min(daysSince / 7, 8) * 4;
        if (daysSince <= 2) score -= 50;
    } else {
        score += 32;
    }

    if (member.partner_id && dateAssignments[dateStr] && dateAssignments[dateStr].has(member.partner_id)) {
        score -= 500;
    }

    if (previousDateRoles[role] && previousDateRoles[role].has(member.id)) {
        score -= 1000;
    }

    const capCount = (member.can_liturgos ? 1 : 0) + (member.can_kolektan ? 1 : 0) + (member.can_singer ? 1 : 0);
    score += (4 - capCount) * 1.5;
    score += Math.random() * 2;

    return score;
}

async function generateSchedule(year, semester, onProgress) {
    const warnings = [];

    function progress(pct, msg, detail) {
        if (onProgress) onProgress(pct, msg, detail || '');
    }

    progress(5, 'Mengambil data anggota...', '');

    const { data: members, error } = await supabaseClient
        .from('members')
        .select('*')
        .order('name');

    if (error) throw new Error('Gagal mengambil data anggota: ' + error.message);
    if (!members || members.length === 0) throw new Error('Tidak ada data anggota. Tambahkan anggota terlebih dahulu.');

    progress(10, 'Mempersiapkan data...', members.length + ' anggota ditemukan');

    const liturgosCandidates = members.filter(m => m.can_liturgos);
    const kolektanCandidates = members.filter(m => m.can_kolektan);
    const singerCandidates = members.filter(m => m.can_singer);

    const liturgosMale = liturgosCandidates.filter(m => m.gender === 'L');
    const liturgosFemale = liturgosCandidates.filter(m => m.gender === 'P');
    const kolektanMale = kolektanCandidates.filter(m => m.gender === 'L');
    const kolektanFemale = kolektanCandidates.filter(m => m.gender === 'P');
    const singerMale = singerCandidates.filter(m => m.gender === 'L');
    const singerFemale = singerCandidates.filter(m => m.gender === 'P');

    if (liturgosMale.length === 0) warnings.push({ type: 'warning', date: null, role: 'Liturgos', message: 'Tidak ada Liturgos laki-laki. Pola gender L–P–P mungkin tidak terpenuhi.' });
    if (liturgosFemale.length === 0) warnings.push({ type: 'warning', date: null, role: 'Liturgos', message: 'Tidak ada Liturgos perempuan. Pola gender L–P–P mungkin tidak terpenuhi.' });
    if (kolektanMale.length === 0) warnings.push({ type: 'warning', date: null, role: 'Kolektan', message: 'Tidak ada Kolektan laki-laki. Aturan gender (1L + 1P) tidak terpenuhi.' });
    if (kolektanFemale.length === 0) warnings.push({ type: 'warning', date: null, role: 'Kolektan', message: 'Tidak ada Kolektan perempuan. Aturan gender (1L + 1P) tidak terpenuhi.' });
    if (singerMale.length === 0) warnings.push({ type: 'warning', date: null, role: 'Singer', message: 'Tidak ada Singer laki-laki. Aturan gender (2P + 1L) tidak terpenuhi.' });
    if (singerFemale.length < 2) warnings.push({ type: 'warning', date: null, role: 'Singer', message: 'Kandidat Singer perempuan kurang dari 2. Aturan gender (2P + 1L) tidak terpenuhi.' });

    const serviceDates = getServiceDatesInPeriod(year, semester);
    progress(15, 'Menyiapkan tanggal pelayanan...', serviceDates.length + ' tanggal pelayanan dalam periode ini');

    const assignments = [];
    const assignmentCounts = {};
    const lastAssignmentDate = {};
    const dateAssignments = {};
    let previousDateRoles = { Liturgos: new Set(), Kolektan: new Set(), Singer: new Set() };

    members.forEach(m => {
        assignmentCounts[m.id] = 0;
    });

    if (semester === 2) {
        try {
            const { data: sem1 } = await supabaseClient
                .from('schedules')
                .select('id')
                .eq('year', year)
                .eq('semester', 1)
                .maybeSingle();

            if (sem1) {
                const { data: sem1Assignments } = await supabaseClient
                    .from('schedule_assignments')
                    .select('*, members(id, name, gender)')
                    .eq('schedule_id', sem1.id)
                    .order('service_date');

                if (sem1Assignments && sem1Assignments.length > 0) {
                    sem1Assignments.forEach(a => {
                        assignmentCounts[a.member_id] = (assignmentCounts[a.member_id] || 0) + 1;
                        lastAssignmentDate[a.member_id] = new Date(a.service_date);
                    });

                    const lastDate = sem1Assignments[sem1Assignments.length - 1].service_date;
                    const lastDateAssgns = sem1Assignments.filter(a => a.service_date === lastDate);
                    lastDateAssgns.forEach(a => {
                        if (previousDateRoles[a.role]) previousDateRoles[a.role].add(a.member_id);
                    });
                }
            }
        } catch (e) {
            console.warn('Gagal membaca riwayat semester 1:', e);
        }
    }

    for (let si = 0; si < serviceDates.length; si++) {
        const sDate = serviceDates[si];
        const dateStr = sDate.dateStr;
        dateAssignments[dateStr] = new Set();
        const currentDateRoles = { Liturgos: new Set(), Kolektan: new Set(), Singer: new Set() };

        const pct = 20 + Math.round((si / serviceDates.length) * 70);
        progress(pct, 'Menjadwalkan ' + (si + 1) + ' dari ' + serviceDates.length + '...', sDate.label + ' (' + dateStr + ')');

        if (si % 3 === 0) await new Promise(r => setTimeout(r, 20));

        const totalAssignments = Object.values(assignmentCounts).reduce((a, b) => a + b, 0);

        const litGender = sDate.liturgosGender;
        const litEligible = liturgosCandidates
            .filter(m => m.gender === litGender && !dateAssignments[dateStr].has(m.id))
            .map(m => ({
                ...m,
                score: scoreCandidate(m, 'Liturgos', assignmentCounts, lastAssignmentDate, sDate.date, members.length, totalAssignments, dateAssignments, dateStr, previousDateRoles)
            }))
            .sort((a, b) => b.score - a.score);

        if (litEligible.length > 0) {
            const picked = litEligible[0];
            assignments.push({
                service_date: sDate.date,
                service_date_str: dateStr,
                member_id: picked.id,
                member_name: picked.name,
                gender: picked.gender,
                role: 'Liturgos'
            });
            dateAssignments[dateStr].add(picked.id);
            assignmentCounts[picked.id] = (assignmentCounts[picked.id] || 0) + 1;
            lastAssignmentDate[picked.id] = sDate.date;
            currentDateRoles.Liturgos.add(picked.id);
        } else {
            warnings.push({
                type: 'error',
                date: dateStr,
                role: 'Liturgos',
                message: 'Jadwal tanggal ' + dateStr + ' belum dapat dibuat karena tidak tersedia anggota ' + (litGender === 'L' ? 'laki-laki' : 'perempuan') + ' yang memenuhi syarat sebagai Liturgos.'
            });
        }

        const kolEligibleM = kolektanCandidates
            .filter(m => m.gender === 'L' && !dateAssignments[dateStr].has(m.id))
            .map(m => ({
                ...m,
                score: scoreCandidate(m, 'Kolektan', assignmentCounts, lastAssignmentDate, sDate.date, members.length, totalAssignments, dateAssignments, dateStr, previousDateRoles)
            }))
            .sort((a, b) => b.score - a.score);

        const kolEligibleF = kolektanCandidates
            .filter(m => m.gender === 'P' && !dateAssignments[dateStr].has(m.id))
            .map(m => ({
                ...m,
                score: scoreCandidate(m, 'Kolektan', assignmentCounts, lastAssignmentDate, sDate.date, members.length, totalAssignments, dateAssignments, dateStr, previousDateRoles)
            }))
            .sort((a, b) => b.score - a.score);

        if (kolEligibleM.length > 0) {
            const pickedM = kolEligibleM[0];
            assignments.push({
                service_date: sDate.date,
                service_date_str: dateStr,
                member_id: pickedM.id,
                member_name: pickedM.name,
                gender: pickedM.gender,
                role: 'Kolektan'
            });
            dateAssignments[dateStr].add(pickedM.id);
            assignmentCounts[pickedM.id] = (assignmentCounts[pickedM.id] || 0) + 1;
            lastAssignmentDate[pickedM.id] = sDate.date;
            currentDateRoles.Kolektan.add(pickedM.id);
        } else {
            warnings.push({
                type: 'error',
                date: dateStr,
                role: 'Kolektan',
                message: 'Jadwal tanggal ' + dateStr + ' belum dapat dibuat karena tidak tersedia anggota laki-laki yang memenuhi syarat sebagai Kolektan.'
            });
        }

        if (kolEligibleF.length > 0) {
            const pickedF = kolEligibleF[0];
            assignments.push({
                service_date: sDate.date,
                service_date_str: dateStr,
                member_id: pickedF.id,
                member_name: pickedF.name,
                gender: pickedF.gender,
                role: 'Kolektan'
            });
            dateAssignments[dateStr].add(pickedF.id);
            assignmentCounts[pickedF.id] = (assignmentCounts[pickedF.id] || 0) + 1;
            lastAssignmentDate[pickedF.id] = sDate.date;
            currentDateRoles.Kolektan.add(pickedF.id);
        } else {
            warnings.push({
                type: 'error',
                date: dateStr,
                role: 'Kolektan',
                message: 'Jadwal tanggal ' + dateStr + ' belum dapat dibuat karena tidak tersedia anggota perempuan yang memenuhi syarat sebagai Kolektan.'
            });
        }

        const singEligibleM = singerCandidates
            .filter(m => m.gender === 'L' && !dateAssignments[dateStr].has(m.id))
            .map(m => ({
                ...m,
                score: scoreCandidate(m, 'Singer', assignmentCounts, lastAssignmentDate, sDate.date, members.length, totalAssignments, dateAssignments, dateStr, previousDateRoles)
            }))
            .sort((a, b) => b.score - a.score);

        const singEligibleF = singerCandidates
            .filter(m => m.gender === 'P' && !dateAssignments[dateStr].has(m.id))
            .map(m => ({
                ...m,
                score: scoreCandidate(m, 'Singer', assignmentCounts, lastAssignmentDate, sDate.date, members.length, totalAssignments, dateAssignments, dateStr, previousDateRoles)
            }))
            .sort((a, b) => b.score - a.score);

        if (singEligibleM.length > 0) {
            const pickedM = singEligibleM[0];
            assignments.push({
                service_date: sDate.date,
                service_date_str: dateStr,
                member_id: pickedM.id,
                member_name: pickedM.name,
                gender: pickedM.gender,
                role: 'Singer'
            });
            dateAssignments[dateStr].add(pickedM.id);
            assignmentCounts[pickedM.id] = (assignmentCounts[pickedM.id] || 0) + 1;
            lastAssignmentDate[pickedM.id] = sDate.date;
            currentDateRoles.Singer.add(pickedM.id);
        } else {
            warnings.push({
                type: 'error',
                date: dateStr,
                role: 'Singer',
                message: 'Jadwal tanggal ' + dateStr + ' belum dapat dibuat karena tidak tersedia anggota laki-laki yang memenuhi syarat sebagai Singer.'
            });
        }

        if (singEligibleF.length >= 2) {
            for (let f = 0; f < 2; f++) {
                const pickedF = singEligibleF[f];
                assignments.push({
                    service_date: sDate.date,
                    service_date_str: dateStr,
                    member_id: pickedF.id,
                    member_name: pickedF.name,
                    gender: pickedF.gender,
                    role: 'Singer'
                });
                dateAssignments[dateStr].add(pickedF.id);
                assignmentCounts[pickedF.id] = (assignmentCounts[pickedF.id] || 0) + 1;
                lastAssignmentDate[pickedF.id] = sDate.date;
                currentDateRoles.Singer.add(pickedF.id);
            }
        } else if (singEligibleF.length === 1) {
            const pickedF = singEligibleF[0];
            assignments.push({
                service_date: sDate.date,
                service_date_str: dateStr,
                member_id: pickedF.id,
                member_name: pickedF.name,
                gender: pickedF.gender,
                role: 'Singer'
            });
            dateAssignments[dateStr].add(pickedF.id);
            assignmentCounts[pickedF.id] = (assignmentCounts[pickedF.id] || 0) + 1;
            lastAssignmentDate[pickedF.id] = sDate.date;
            currentDateRoles.Singer.add(pickedF.id);
            warnings.push({
                type: 'error',
                date: dateStr,
                role: 'Singer',
                message: 'Hanya 1 dari 2 Singer perempuan yang dapat diisi pada tanggal ' + dateStr + '.'
            });
        } else {
            warnings.push({
                type: 'error',
                date: dateStr,
                role: 'Singer',
                message: 'Jadwal tanggal ' + dateStr + ' belum dapat dibuat karena tidak tersedia anggota perempuan yang memenuhi syarat sebagai Singer.'
            });
        }

        const currentAssignedList = Array.from(dateAssignments[dateStr]);
        for (const mid of currentAssignedList) {
            const mem = members.find(x => x.id === mid);
            if (mem && mem.partner_id && dateAssignments[dateStr].has(mem.partner_id)) {
                const partnerMem = members.find(x => x.id === mem.partner_id);
                warnings.push({
                    type: 'info',
                    date: dateStr,
                    role: 'Pasangan',
                    message: 'Pasangan (' + mem.name + ' & ' + (partnerMem ? partnerMem.name : 'Pasangan') + ') dijadwalkan bersama pada tanggal ini karena tidak ada kombinasi lain yang lebih optimal.'
                });
            }
        }

        previousDateRoles = currentDateRoles;
    }

    progress(95, 'Memverifikasi jadwal...', '');
    const stats = computeStats(assignments, members, serviceDates);
    progress(100, 'Selesai!', assignments.length + ' penugasan dibuat');

    return { assignments, warnings, stats };
}

function computeStats(assignments, members, serviceDates) {
    const memberStats = {};
    members.forEach(m => {
        memberStats[m.id] = { name: m.name, count: 0, roles: { Liturgos: 0, Kolektan: 0, Singer: 0 } };
    });

    assignments.forEach(a => {
        if (memberStats[a.member_id]) {
            memberStats[a.member_id].count++;
            memberStats[a.member_id].roles[a.role]++;
        }
    });

    const counts = Object.values(memberStats).map(s => s.count).filter(c => c > 0);
    const minCount = counts.length > 0 ? Math.min(...counts) : 0;
    const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
    const avgCount = counts.length > 0 ? (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1) : 0;
    const assignedMembers = counts.length;
    const unassignedMembers = members.length - assignedMembers;

    const expectedTotal = serviceDates.length * 6;
    const unfilledSlots = expectedTotal - assignments.length;

    return {
        totalDates: serviceDates.length,
        totalAssignments: assignments.length,
        expectedTotal,
        unfilledSlots,
        assignedMembers,
        unassignedMembers,
        minAssignments: minCount,
        maxAssignments: maxCount,
        avgAssignments: avgCount,
        memberStats
    };
}

function initSchedulePage() {
    populateScheduleFilters();
    setupScheduleEvents();
}

function populateScheduleFilters() {
    const yearSelect = document.getElementById('scheduleYear');
    const semSelect = document.getElementById('scheduleSemester');
    if (!yearSelect) return;

    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let y = currentYear - 1; y <= currentYear + 2; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === currentYear) opt.selected = true;
        yearSelect.appendChild(opt);
    }

    const updateCount = () => {
        const year = parseInt(yearSelect.value);
        const semester = parseInt(semSelect.value);
        const dates = getServiceDatesInPeriod(year, semester);
        const sundays = dates.filter(d => d.date.getDay() === 0);
        const special = dates.length - sundays.length;
        const countEl = document.getElementById('sundayCount');
        if (countEl) {
            countEl.textContent = dates.length + ' tanggal pelayanan dalam periode ini (' +
                sundays.length + ' Minggu' + (special > 0 ? ' + ' + special + ' Ibadah Khusus' : '') + ')';
        }
        checkExistingSchedule(year, semester);
    };

    yearSelect.addEventListener('change', updateCount);
    if (semSelect) semSelect.addEventListener('change', updateCount);
    updateCount();
}

async function checkExistingSchedule(year, semester) {
    const alertEl = document.getElementById('existingScheduleAlert');
    if (!alertEl) return;

    try {
        const { data } = await supabaseClient
            .from('schedules')
            .select('id, status')
            .eq('year', year)
            .eq('semester', semester)
            .maybeSingle();

        if (data) {
            alertEl.classList.remove('hidden');
            alertEl.innerHTML = '<span class="material-icons-outlined">info</span> ' +
                'Sudah ada jadwal untuk periode ini (status: <strong>' + data.status + '</strong>). ' +
                'Generate ulang akan menggantikan jadwal yang ada.';
        } else {
            alertEl.classList.add('hidden');
        }
    } catch {
        alertEl.classList.add('hidden');
    }
}

function setupScheduleEvents() {
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }
}

async function handleGenerate() {
    const year = parseInt(document.getElementById('scheduleYear').value);
    const semester = parseInt(document.getElementById('scheduleSemester').value);
    const progressEl = document.getElementById('generateProgress');
    const resultsEl = document.getElementById('generateResults');
    const generateBtn = document.getElementById('generateBtn');

    try {
        const { data: existing } = await supabaseClient
            .from('schedules')
            .select('id')
            .eq('year', year)
            .eq('semester', semester)
            .maybeSingle();

        if (existing) {
            if (!confirm('Jadwal untuk periode ini sudah ada. Generate ulang akan menghapus jadwal lama. Lanjutkan?')) return;
        }
    } catch { }

    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;"></span> Generating...';
    if (progressEl) progressEl.classList.remove('hidden');
    if (resultsEl) resultsEl.classList.add('hidden');

    try {
        const result = await generateSchedule(year, semester, (pct, msg, detail) => {
            const bar = document.getElementById('progressBar');
            const text = document.getElementById('progressText');
            const detailEl = document.getElementById('progressDetail');
            if (bar) bar.style.width = pct + '%';
            if (text) text.textContent = msg;
            if (detailEl) detailEl.textContent = detail;
        });

        await saveScheduleToDatabase(year, semester, result.assignments);
        showGenerateResults(result, year, semester);

    } catch (err) {
        console.error('Generate error:', err);
        if (resultsEl) {
            resultsEl.classList.remove('hidden');
            resultsEl.innerHTML = '<div class="alert alert-danger"><span class="material-icons-outlined">error</span> ' +
                'Gagal membuat jadwal: ' + err.message + '</div>';
        }
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<span class="material-icons-outlined">auto_fix_high</span> Generate Jadwal Otomatis';
    }
}

async function saveScheduleToDatabase(year, semester, assignments) {
    const { data: existing } = await supabaseClient
        .from('schedules')
        .select('id')
        .eq('year', year)
        .eq('semester', semester)
        .maybeSingle();

    if (existing) {
        await supabaseClient.from('schedules').delete().eq('id', existing.id);
    }

    const { data: schedule, error: sErr } = await supabaseClient
        .from('schedules')
        .insert({ year, semester, status: 'draft' })
        .select()
        .single();

    if (sErr) throw new Error('Gagal menyimpan jadwal: ' + sErr.message);

    const rows = assignments.map(a => ({
        schedule_id: schedule.id,
        service_date: a.service_date_str || toDateString(a.service_date),
        member_id: a.member_id,
        role: a.role
    }));

    const BATCH_SIZE = 50;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error } = await supabaseClient.from('schedule_assignments').insert(batch);
        if (error) throw new Error('Gagal menyimpan penugasan: ' + error.message);
    }
}

function showGenerateResults(result, year, semester) {
    const resultsEl = document.getElementById('generateResults');
    if (!resultsEl) return;

    const { assignments, warnings, stats } = result;
    const semLabel = semester === 1 ? 'Januari - Juni' : 'Juli - Desember';

    let html = '';

    if (stats.unfilledSlots === 0) {
        html += '<div class="alert alert-success"><span class="material-icons-outlined">check_circle</span> ' +
            'Jadwal berhasil dibuat untuk periode ' + semLabel + ' ' + year + '!</div>';
    } else {
        html += '<div class="alert alert-warning"><span class="material-icons-outlined">warning</span> ' +
            'Jadwal dibuat dengan ' + stats.unfilledSlots + ' slot yang tidak terisi.</div>';
    }

    html += '<div class="stats-grid" style="margin-bottom:20px;">';
    html += '<div class="stat-card"><div class="stat-icon blue"><span class="material-icons-outlined">calendar_today</span></div><div class="stat-info"><div class="stat-value">' + stats.totalDates + '</div><div class="stat-label">Tanggal Pelayanan</div></div></div>';
    html += '<div class="stat-card"><div class="stat-icon green"><span class="material-icons-outlined">assignment_turned_in</span></div><div class="stat-info"><div class="stat-value">' + stats.totalAssignments + '</div><div class="stat-label">Total Penugasan</div></div></div>';
    html += '<div class="stat-card"><div class="stat-icon gold"><span class="material-icons-outlined">group</span></div><div class="stat-info"><div class="stat-value">' + stats.assignedMembers + '</div><div class="stat-label">Anggota Terjadwal</div></div></div>';
    html += '<div class="stat-card"><div class="stat-icon purple"><span class="material-icons-outlined">balance</span></div><div class="stat-info"><div class="stat-value">' + stats.minAssignments + '-' + stats.maxAssignments + '</div><div class="stat-label">Min-Max Tugas (rata-rata: ' + stats.avgAssignments + ')</div></div></div>';
    html += '</div>';

    if (warnings.length > 0) {
        html += '<div class="card"><div class="card-header"><h3 class="card-title">⚠️ Laporan Pemeriksaan (' + warnings.length + ')</h3></div>';
        html += '<ul id="warningsList" style="list-style:none;padding:0;">';
        warnings.forEach(w => {
            const cls = w.type === 'error' ? 'alert-danger' : (w.type === 'warning' ? 'alert-warning' : 'alert-info');
            html += '<li class="alert ' + cls + '" style="margin-bottom:8px;">';
            if (w.date) html += '<strong>' + w.date + '</strong> — ';
            if (w.role) html += '[' + w.role + '] ';
            html += w.message + '</li>';
        });
        html += '</ul></div>';
    }

    html += '<div class="btn-group mt-2">';
    html += '<a href="schedule-view.html?year=' + year + '&semester=' + semester + '" class="btn btn-primary"><span class="material-icons-outlined">visibility</span> Lihat & Edit Jadwal</a>';
    html += '<button class="btn btn-secondary" onclick="handleGenerate()"><span class="material-icons-outlined">refresh</span> Generate Ulang</button>';
    html += '</div>';

    resultsEl.innerHTML = html;
    resultsEl.classList.remove('hidden');
}
