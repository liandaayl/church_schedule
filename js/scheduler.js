function getSundaysInPeriod(year, semester) {
    const startMonth = semester === 1 ? 0 : 6;
    const endMonth = semester === 1 ? 5 : 11;

    const sundays = [];
    const date = new Date(year, startMonth, 1);

    while (date.getDay() !== 0) {
        date.setDate(date.getDate() + 1);
    }

    const endDate = new Date(year, endMonth + 1, 0);
    while (date <= endDate) {
        sundays.push(new Date(date));
        date.setDate(date.getDate() + 7);
    }

    return sundays;
}

function toDateString(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
}

function scoreCandidate(member, assignmentCounts, lastAssignmentDate, currentDate, totalMembers, totalAssignmentsSoFar) {
    let score = 0;

    const myCount = assignmentCounts[member.id] || 0;
    const avgCount = totalMembers > 0 ? totalAssignmentsSoFar / totalMembers : 0;
    const countDiff = avgCount - myCount;
    score += countDiff * 12;

    const lastDate = lastAssignmentDate[member.id];
    if (lastDate) {
        const daysSince = (currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        score += Math.min(daysSince / 7, 8) * 4;
    } else {
        score += 32;
    }

    const capCount = (member.can_liturgos ? 1 : 0) + (member.can_kolektan ? 1 : 0) + (member.can_singer ? 1 : 0);
    score += (4 - capCount) * 1.5;
    score += Math.random() * 2;

    return score;
}

function scoreRoleCandidate(member, role, assignmentCounts, lastAssignmentDate, currentDate, totalMembers, totalAssignmentsSoFar, roleHistory) {
    const repeats = roleHistory[member.id]?.[role] || 0;
    const baseScore = scoreCandidate(member, assignmentCounts, lastAssignmentDate, currentDate, totalMembers, totalAssignmentsSoFar);
    return baseScore - (repeats * 1000);
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

    const kolektanMale = kolektanCandidates.filter(m => m.gender === 'L');
    const kolektanFemale = kolektanCandidates.filter(m => m.gender === 'P');
    const singerMale = singerCandidates.filter(m => m.gender === 'L');
    const singerFemale = singerCandidates.filter(m => m.gender === 'P');

    if (liturgosCandidates.length === 0) throw new Error('Tidak ada anggota yang bisa menjadi Liturgos.');
    if (kolektanMale.length === 0) warnings.push({ type: 'warning', date: null, role: 'Kolektan', message: 'Tidak ada Kolektan laki-laki. Aturan gender mungkin tidak terpenuhi.' });
    if (kolektanFemale.length === 0) warnings.push({ type: 'warning', date: null, role: 'Kolektan', message: 'Tidak ada Kolektan perempuan. Aturan gender mungkin tidak terpenuhi.' });
    if (singerMale.length === 0) warnings.push({ type: 'warning', date: null, role: 'Singer', message: 'Tidak ada Singer laki-laki. Aturan gender mungkin tidak terpenuhi.' });
    if (singerFemale.length === 0) warnings.push({ type: 'warning', date: null, role: 'Singer', message: 'Tidak ada Singer perempuan. Aturan gender mungkin tidak terpenuhi.' });

    const sundays = getSundaysInPeriod(year, semester);
    progress(15, 'Menyiapkan jadwal...', sundays.length + ' hari Minggu dalam periode');

    const assignments = [];
    const assignmentCounts = {};
    const lastAssignmentDate = {};
    const roleHistory = {};
    const dateAssignments = {};

    members.forEach(m => {
        assignmentCounts[m.id] = 0;
        roleHistory[m.id] = { Liturgos: 0, Kolektan: 0, Singer: 0 };
    });

    for (let si = 0; si < sundays.length; si++) {
        const sunday = sundays[si];
        const dateStr = toDateString(sunday);
        dateAssignments[dateStr] = new Set();

        const pct = 20 + Math.round((si / sundays.length) * 70);
        progress(pct, 'Menjadwalkan minggu ' + (si + 1) + ' dari ' + sundays.length + '...', dateStr);

        if (si % 3 === 0) await new Promise(r => setTimeout(r, 30));

        const liturgosResult = assignRole(
            'Liturgos', 1, null,
            liturgosCandidates, members, sunday, dateStr,
            dateAssignments, assignmentCounts, lastAssignmentDate, roleHistory, warnings
        );
        liturgosResult.forEach(a => {
            assignments.push(a);
            dateAssignments[dateStr].add(a.member_id);
            assignmentCounts[a.member_id] = (assignmentCounts[a.member_id] || 0) + 1;
            lastAssignmentDate[a.member_id] = sunday;
            roleHistory[a.member_id].Liturgos++;
        });

        const kolektanResult = assignKolektan(
            kolektanCandidates, members, sunday, dateStr,
            dateAssignments, assignmentCounts, lastAssignmentDate, roleHistory, warnings
        );
        kolektanResult.forEach(a => {
            assignments.push(a);
            dateAssignments[dateStr].add(a.member_id);
            assignmentCounts[a.member_id] = (assignmentCounts[a.member_id] || 0) + 1;
            lastAssignmentDate[a.member_id] = sunday;
            roleHistory[a.member_id].Kolektan++;
        });

        const singerResult = assignSinger(
            singerCandidates, members, sunday, dateStr,
            dateAssignments, assignmentCounts, lastAssignmentDate, roleHistory, warnings
        );
        singerResult.forEach(a => {
            assignments.push(a);
            dateAssignments[dateStr].add(a.member_id);
            assignmentCounts[a.member_id] = (assignmentCounts[a.member_id] || 0) + 1;
            lastAssignmentDate[a.member_id] = sunday;
            roleHistory[a.member_id].Singer++;
        });
    }

    progress(95, 'Memverifikasi jadwal...', '');
    const stats = computeStats(assignments, members, sundays);
    progress(100, 'Selesai!', assignments.length + ' penugasan dibuat');

    return { assignments, warnings, stats };
}

function assignRole(role, count, genderConstraint, candidates, allMembers, sunday, dateStr,
                    dateAssignments, assignmentCounts, lastAssignmentDate, roleHistory, warnings) {
    const result = [];
    const totalAssignments = Object.values(assignmentCounts).reduce((a, b) => a + b, 0);

    let eligible = candidates.filter(m =>
        !dateAssignments[dateStr].has(m.id)
    );

    let pool = eligible.map(m => ({
        ...m,
        score: scoreRoleCandidate(m, role, assignmentCounts, lastAssignmentDate, sunday, allMembers.length, totalAssignments, roleHistory)
    })).sort((a, b) => b.score - a.score);

    for (let i = 0; i < count && i < pool.length; i++) {
        const member = pool[i];
        if ((roleHistory[member.id]?.[role] || 0) > 0) {
            warnings.push({
                type: 'warning', date: dateStr, role,
                message: 'Anggota ' + member.name + ' mengulang peran ' + role + ' karena keterbatasan kandidat.'
            });
        }
        result.push({
            service_date: sunday,
            service_date_str: dateStr,
            member_id: member.id,
            member_name: member.name,
            gender: member.gender,
            role: role
        });
    }

    if (result.length < count) {
        warnings.push({
            type: 'error', date: dateStr, role,
            message: 'Hanya ' + result.length + ' dari ' + count + ' ' + role + ' yang bisa diisi pada tanggal ini.'
        });
    }

    return result;
}

function assignKolektan(candidates, allMembers, sunday, dateStr,
                        dateAssignments, assignmentCounts, lastAssignmentDate, roleHistory, warnings) {
    const result = [];
    const totalAssignments = Object.values(assignmentCounts).reduce((a, b) => a + b, 0);
    const role = 'Kolektan';

    const eligible = candidates.filter(m => !dateAssignments[dateStr].has(m.id));
    const males = eligible.filter(m => m.gender === 'L');
    const females = eligible.filter(m => m.gender === 'P');

    let pickedMale = null;
    let pickedFemale = null;

    const scoredMales = males.map(m => ({
        ...m,
        score: scoreRoleCandidate(m, role, assignmentCounts, lastAssignmentDate, sunday, allMembers.length, totalAssignments, roleHistory)
    })).sort((a, b) => b.score - a.score);

    const scoredFemales = females.map(m => ({
        ...m,
        score: scoreRoleCandidate(m, role, assignmentCounts, lastAssignmentDate, sunday, allMembers.length, totalAssignments, roleHistory)
    })).sort((a, b) => b.score - a.score);

    if (scoredMales.length > 0) pickedMale = scoredMales[0];
    if (scoredFemales.length > 0) pickedFemale = scoredFemales[0];

    if (pickedMale) {
        if ((roleHistory[pickedMale.id]?.Kolektan || 0) > 0) {
            warnings.push({
                type: 'warning', date: dateStr, role,
                message: 'Anggota ' + pickedMale.name + ' mengulang peran Kolektan karena keterbatasan kandidat pria.'
            });
        }
        result.push({
            service_date: sunday, service_date_str: dateStr,
            member_id: pickedMale.id, member_name: pickedMale.name,
            gender: pickedMale.gender, role
        });
    }
    if (pickedFemale) {
        if ((roleHistory[pickedFemale.id]?.Kolektan || 0) > 0) {
            warnings.push({
                type: 'warning', date: dateStr, role,
                message: 'Anggota ' + pickedFemale.name + ' mengulang peran Kolektan karena keterbatasan kandidat wanita.'
            });
        }
        result.push({
            service_date: sunday, service_date_str: dateStr,
            member_id: pickedFemale.id, member_name: pickedFemale.name,
            gender: pickedFemale.gender, role
        });
    }

    if (result.length < 2) {
        const picked = new Set(result.map(r => r.member_id));
        const remaining = eligible
            .filter(m => !picked.has(m.id))
            .map(m => ({
                ...m,
                score: scoreRoleCandidate(m, role, assignmentCounts, lastAssignmentDate, sunday, allMembers.length, totalAssignments, roleHistory)
            }))
            .sort((a, b) => b.score - a.score);

        const needed = 2 - result.length;
        for (let i = 0; i < needed && i < remaining.length; i++) {
            result.push({
                service_date: sunday, service_date_str: dateStr,
                member_id: remaining[i].id, member_name: remaining[i].name,
                gender: remaining[i].gender, role
            });
        }

        if (!pickedMale || !pickedFemale) {
            warnings.push({
                type: 'warning', date: dateStr, role,
                message: 'Aturan gender Kolektan (1L + 1P) tidak terpenuhi pada tanggal ini.'
            });
        }
    }

    if (result.length < 2) {
        warnings.push({
            type: 'error', date: dateStr, role,
            message: 'Hanya ' + result.length + ' Kolektan yang bisa diisi pada tanggal ini.'
        });
    }

    return result;
}

function assignSinger(candidates, allMembers, sunday, dateStr,
                      dateAssignments, assignmentCounts, lastAssignmentDate, roleHistory, warnings) {
    const result = [];
    const totalAssignments = Object.values(assignmentCounts).reduce((a, b) => a + b, 0);
    const role = 'Singer';

    const eligible = candidates.filter(m => !dateAssignments[dateStr].has(m.id));
    const males = eligible.filter(m => m.gender === 'L');
    const females = eligible.filter(m => m.gender === 'P');

    const scoredMales = males.map(m => ({
        ...m,
        score: scoreRoleCandidate(m, role, assignmentCounts, lastAssignmentDate, sunday, allMembers.length, totalAssignments, roleHistory)
    })).sort((a, b) => b.score - a.score);

    const scoredFemales = females.map(m => ({
        ...m,
        score: scoreRoleCandidate(m, role, assignmentCounts, lastAssignmentDate, sunday, allMembers.length, totalAssignments, roleHistory)
    })).sort((a, b) => b.score - a.score);

    const optionA = tryGenderCombo(scoredMales, 1, scoredFemales, 2);
    const optionB = tryGenderCombo(scoredMales, 2, scoredFemales, 1);

    let bestOption = null;
    let genderMet = true;

    if (optionA && optionB) {
        const scoreA = optionA.reduce((s, m) => s + m.score, 0);
        const scoreB = optionB.reduce((s, m) => s + m.score, 0);
        bestOption = scoreA >= scoreB ? optionA : optionB;
    } else if (optionA) {
        bestOption = optionA;
    } else if (optionB) {
        bestOption = optionB;
    } else {
        genderMet = false;
        const allScored = eligible
            .map(m => ({
                ...m,
                score: scoreRoleCandidate(m, role, assignmentCounts, lastAssignmentDate, sunday, allMembers.length, totalAssignments, roleHistory)
            }))
            .sort((a, b) => b.score - a.score);
        bestOption = allScored.slice(0, 3);
    }

    if (!genderMet) {
        warnings.push({
            type: 'warning', date: dateStr, role,
            message: 'Aturan gender Singer (campuran L & P) tidak terpenuhi pada tanggal ini.'
        });
    }

    bestOption.forEach(m => {
        if ((roleHistory[m.id]?.Singer || 0) > 0) {
            warnings.push({
                type: 'warning', date: dateStr, role,
                message: 'Anggota ' + m.name + ' mengulang peran Singer karena keterbatasan kandidat.'
            });
        }
        result.push({
            service_date: sunday, service_date_str: dateStr,
            member_id: m.id, member_name: m.name,
            gender: m.gender, role
        });
    });

    if (result.length < 3) {
        warnings.push({
            type: 'error', date: dateStr, role,
            message: 'Hanya ' + result.length + ' Singer yang bisa diisi pada tanggal ini.'
        });
    }

    return result;
}

function tryGenderCombo(scoredMales, maleCount, scoredFemales, femaleCount) {
    if (scoredMales.length < maleCount || scoredFemales.length < femaleCount) return null;
    return [...scoredMales.slice(0, maleCount), ...scoredFemales.slice(0, femaleCount)];
}

function computeStats(assignments, members, sundays) {
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

    const expectedTotal = sundays.length * 6;
    const unfilledSlots = expectedTotal - assignments.length;

    return {
        totalSundays: sundays.length,
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

function validateSchedule(assignments, members) {
    const results = [];

    const byDate = {};
    assignments.forEach(a => {
        const d = a.service_date_str || toDateString(a.service_date);
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(a);
    });

    const dates = Object.keys(byDate).sort();

    let allFilled = true;
    dates.forEach(d => {
        const liturgos = byDate[d].filter(a => a.role === 'Liturgos');
        const kolektan = byDate[d].filter(a => a.role === 'Kolektan');
        const singer = byDate[d].filter(a => a.role === 'Singer');
        if (liturgos.length < 1 || kolektan.length < 2 || singer.length < 3) allFilled = false;
    });
    results.push({ status: allFilled ? 'pass' : 'fail', message: allFilled ? 'Semua posisi terisi' : 'Ada posisi yang belum terisi' });

    let noDup = true;
    dates.forEach(d => {
        const ids = byDate[d].map(a => a.member_id);
        if (new Set(ids).size !== ids.length) noDup = false;
    });
    results.push({ status: noDup ? 'pass' : 'fail', message: noDup ? 'Tidak ada penugasan ganda per minggu' : 'Ada penugasan ganda' });

    let capOk = true;
    const memberMap = {};
    members.forEach(m => { memberMap[m.id] = m; });
    assignments.forEach(a => {
        const m = memberMap[a.member_id];
        if (m) {
            if (a.role === 'Liturgos' && !m.can_liturgos) capOk = false;
            if (a.role === 'Kolektan' && !m.can_kolektan) capOk = false;
            if (a.role === 'Singer' && !m.can_singer) capOk = false;
        }
    });
    results.push({ status: capOk ? 'pass' : 'fail', message: capOk ? 'Semua penugasan sesuai kemampuan' : 'Ada penugasan yang tidak sesuai kemampuan' });

    let kolGenderOk = true;
    dates.forEach(d => {
        const kol = byDate[d].filter(a => a.role === 'Kolektan');
        if (kol.length === 2) {
            const genders = kol.map(a => a.gender || memberMap[a.member_id]?.gender);
            if (!genders.includes('L') || !genders.includes('P')) kolGenderOk = false;
        }
    });
    results.push({ status: kolGenderOk ? 'pass' : 'warn', message: kolGenderOk ? 'Gender Kolektan sesuai (1L + 1P)' : 'Ada Kolektan yang tidak sesuai aturan gender' });

    let singGenderOk = true;
    dates.forEach(d => {
        const sing = byDate[d].filter(a => a.role === 'Singer');
        if (sing.length === 3) {
            const maleCount = sing.filter(a => (a.gender || memberMap[a.member_id]?.gender) === 'L').length;
            if (maleCount !== 1 && maleCount !== 2) singGenderOk = false;
        }
    });
    results.push({ status: singGenderOk ? 'pass' : 'warn', message: singGenderOk ? 'Gender Singer sesuai (campuran L & P)' : 'Ada Singer yang tidak sesuai aturan gender' });

    return results;
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
        const sundays = getSundaysInPeriod(year, semester);
        const countEl = document.getElementById('sundayCount');
        if (countEl) countEl.textContent = sundays.length + ' hari Minggu dalam periode ini';
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
    html += '<div class="stat-card"><div class="stat-icon blue"><span class="material-icons-outlined">calendar_today</span></div><div class="stat-info"><div class="stat-value">' + stats.totalSundays + '</div><div class="stat-label">Hari Minggu</div></div></div>';
    html += '<div class="stat-card"><div class="stat-icon green"><span class="material-icons-outlined">assignment_turned_in</span></div><div class="stat-info"><div class="stat-value">' + stats.totalAssignments + '</div><div class="stat-label">Total Penugasan</div></div></div>';
    html += '<div class="stat-card"><div class="stat-icon gold"><span class="material-icons-outlined">group</span></div><div class="stat-info"><div class="stat-value">' + stats.assignedMembers + '</div><div class="stat-label">Anggota Terjadwal</div></div></div>';
    html += '<div class="stat-card"><div class="stat-icon purple"><span class="material-icons-outlined">balance</span></div><div class="stat-info"><div class="stat-value">' + stats.minAssignments + '-' + stats.maxAssignments + '</div><div class="stat-label">Min-Max Tugas (rata-rata: ' + stats.avgAssignments + ')</div></div></div>';
    html += '</div>';

    if (warnings.length > 0) {
        html += '<div class="card"><div class="card-header"><h3 class="card-title">⚠️ Peringatan (' + warnings.length + ')</h3></div>';
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
