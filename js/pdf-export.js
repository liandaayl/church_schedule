function exportSchedulePDF(scheduleData, year, semester) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape', 'mm', 'a4');

    const churchName = (window.APP_CONFIG && APP_CONFIG.churchName) ? APP_CONFIG.churchName : 'Gereja';
    const semesterLabel = semester === 1 ? 'Januari - Juni' : 'Juli - Desember';
    const title = 'Jadwal Pelayanan ' + churchName;
    const period = 'Periode ' + semesterLabel + ' ' + year;
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(26, 54, 93);
    doc.text(title, pageWidth / 2, 18, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(113, 128, 150);
    doc.text(period, pageWidth / 2, 26, { align: 'center' });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(20, 30, pageWidth - 20, 30);

    const headers = [['No', 'Hari / Tanggal', 'Liturgos', 'Singer', 'Kolektan']];

    const rows = scheduleData.map((row, index) => [
        index + 1,
        formatDateForPDF(row.service_date),
        row.liturgos || '-',
        Array.isArray(row.singer) ? row.singer.join('\n') : (row.singer || '-'),
        Array.isArray(row.kolektan) ? row.kolektan.join('\n') : (row.kolektan || '-')
    ]);

    doc.autoTable({
        head: headers,
        body: rows,
        startY: 34,
        theme: 'grid',
        headStyles: {
            fillColor: [26, 54, 93],
            textColor: 255,
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 10,
            cellPadding: 5
        },
        bodyStyles: {
            fontSize: 9,
            cellPadding: 4,
            textColor: [45, 55, 72],
            lineColor: [226, 232, 240],
            lineWidth: 0.3
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 12 },
            1: { cellWidth: 55 },
            2: { cellWidth: 42 },
            3: { cellWidth: 70 },
            4: { cellWidth: 55 }
        },
        alternateRowStyles: {
            fillColor: [247, 250, 252]
        },
        styles: {
            overflow: 'linebreak',
            lineColor: [226, 232, 240],
            lineWidth: 0.3
        },
        margin: { left: 15, right: 15 },
        didDrawPage: function () {
            const pageCount = doc.internal.getNumberOfPages();
            const currentPage = doc.getCurrentPageInfo().pageNumber;
            doc.setFontSize(8);
            doc.setTextColor(160);
            doc.text(
                'Halaman ' + currentPage + ' dari ' + pageCount,
                pageWidth / 2,
                doc.internal.pageSize.getHeight() - 10,
                { align: 'center' }
            );

            doc.text(
                'Dibuat oleh ChurchSched',
                15,
                doc.internal.pageSize.getHeight() - 10
            );
        }
    });

    const filename = 'Jadwal_Pelayanan_' + semesterLabel.replace(/ /g, '_') + '_' + year + '.pdf';
    doc.save(filename);
}

function formatDateForPDF(dateStr) {
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
