const XLSX = require('./js/xlsx.full.min.js');
const fs = require('fs');

const workbook = XLSX.readFile('订单明细列表20260104.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

const headers = jsonData[0];
const sample = jsonData[1];

const output = {
    headers: headers,
    sample: sample
};

fs.writeFileSync('headers_debug.json', JSON.stringify(output, null, 2));
