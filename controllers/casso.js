import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const CLIENT_EMAIL = process.env.CLIENT_EMAIL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCOPE = process.env.SCOPE;
const client = new google.auth.JWT(CLIENT_EMAIL, null, PRIVATE_KEY, [SCOPE]);

export const cassoRequest = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const classColl = db.collection('classUsers');
        const transactionsColl = db.collection('transactions');
        const studentInfoColl = db.collection('studentInfo');
        const quotasColl = db.collection('quotas');
        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        const { data } = req.body;

        for (let i = 0; i < data.length; i++) {
            const { id, tid, description, amount, cusum_balance, when } = data[i];
            // kiem tra giao dich da ton tai trong CSDL chua
            const isExist = await MongoDB.findOneUser(
                transactionsColl,
                { tid: tid },
                { projection: { _id: 0 } }
            );
            // Neu ton tai thi bo qua
            if (isExist !== null) continue;

            // Neu chua thi day du lieu vao Transactions Coll
            const doc = {
                when: new Date(when),
                id: parseInt(id),
                tid: parseInt(tid),
                description: description,
                amount: parseInt(amount),
                cuSumBalance: parseInt(cusum_balance),
            };
            MongoDB.insertOneUser(transactionsColl, doc);

            // Tach ID tu noi dung chuyen khoan
            const extractId = await extractStudentId(description, classColl);

            let extractStatus = '';
            if (extractId === 'N/A') extractStatus = 'Lỗi';
            const uploadTransasction = [
                [when, id, tid, description, amount, cusum_balance, extractId, extractStatus],
            ];

            // Neu tach khong thanh cong
            if (extractId === 'N/A') {
                // do something
                client.authorize((err) => {
                    if (err) {
                        console.error(err);
                        return;
                    } else {
                        xyLyTachIdKhongThanhCong(client, uploadTransasction);
                    }
                });
                continue;
            }

            // Neu tach thanh cong
            // Check thong tin hoc phi cua HS dot hien tai
            const pipeline = [
                {
                    $match: {
                        studentId: parseInt(extractId),
                    },
                },
                {
                    $project: {
                        studentId: 1,
                        studentName: 1,
                        classId: 1,
                        terms: {
                            $filter: {
                                input: '$terms',
                                as: 'item',
                                cond: {
                                    $eq: [
                                        '$$item.term',
                                        {
                                            $max: '$terms.term',
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },
            ];

            const aggCursor = studentInfoColl.aggregate(pipeline);
            const result = await aggCursor.toArray();

            const { terms, classId, studentId, studentName } = result[0];

            const {
                index, // vi tri hoc sinh
                term, // dot hien tai
                start, // bat dau dot
                end, // ket thuc dot
                total, // so buoi trong dot
                study, // so buoi hoc
                absent, // so buoi nghi
                subject, // mon hoc
                remainderBefore, // du dot truoc
                billing, // phai nop
                payment, // da nop
                type, // hinh thuc nop
                paidDate, // ngay nop
                remainder, // con thua
                attendances,
                absences,
            } = terms[0];

            let paid = 0;
            if (payment !== null) paid = payment;

            let tuitionStatus;

            // Neu chua dong hoc lan nao trong dot
            if (payment === null) {
                if (amount === billing) {
                    tuitionStatus = 'nộp đủ ✅';
                } else if (amount > billing) {
                    const diff = amount - billing;
                    tuitionStatus = `thừa ${Tools.formatCurrency(diff)}🔔`;
                } else {
                    const diff = billing - amount;
                    tuitionStatus = `thiếu ${Tools.formatCurrency(diff)}❌`;
                }
            }

            // Neu dong them tien hoc trong dot
            // TH1: billing: 1.000.000/payment: 1.000.000
            // TH2: billing: 1.000.000/payment: 800.000
            // Th3: billing: 1.000.000/payment: 1.200.000
            else {
                // Truong hop hoc phi bang so tien da nop
                if (billing === payment) {
                    tuitionStatus = `thừa ${Tools.formatCurrency(amount)}🔔`;
                }
                // Truong hop hoc phi > so tien da nop
                else if (billing > payment) {
                    const diff = billing - payment; // 200.000
                    if (amount > diff) {
                        tuitionStatus = `thừa ${Tools.formatCurrency(amount - diff)}🔔`;
                    } else if (amount < diff) {
                        tuitionStatus = `thiếu ${Tools.formatCurrency(diff - amount)}❌`;
                    } else {
                        tuitionStatus = 'nộp đủ✅';
                    }
                }
                // Truong hop hoc phi < so tien da nop
                else {
                    const diff = payment - billing;
                    tuitionStatus = `thừa ${Tools.formatCurrency(amount + diff)}🔔`;
                }
            }

            const formatWhenDateTime = new Date(when).toLocaleString('vi-VN', {
                hour: 'numeric',
                minute: 'numeric',
                day: 'numeric',
                month: 'numeric',
                year: 'numeric',
            });

            const formatWhenDate = new Date(when).toLocaleString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });
            const confirmTuition = `Trung tâm Toán Ánh Sáng xác nhận phụ huynh ${studentName} ${studentId} đã nộp thành công học phí đợt ${term} với thông tin như sau:
-----------------------------------
- Thời gian: ${formatWhenDateTime}
- Hình thức: chuyển khoản
-----------------------------------
- Học phí: ${Tools.formatCurrency(billing)}
- Đã nộp: ${Tools.formatCurrency(amount + paid)}
- Trạng thái: ${tuitionStatus}
-----------------------------------
Nếu thông tin trên chưa chính xác, phụ huynh vui lòng nhắn tin lại cho OA để trung tâm kịp thời xử lý. Cảm ơn quý phụ huynh!`;

            // Gui tin nhan xac nhan den phu huynh
            ZaloAPI.sendMessage(accessToken, '4966494673333610309', confirmTuition);

            // Day len Co Phu Trach (sheet Giao dịch) + Chia ve moi lop + Kiem tra Quota
            client.authorize((err) => {
                if (err) {
                    console.error(err);
                    return;
                } else {
                    xuLyTrenGoogleSheet(
                        client,
                        uploadTransasction,
                        classId,
                        term,
                        index,
                        when,
                        amount,
                        paid,
                        accessToken
                    );
                }
            });

            // Cap nhat hoc phi trong StudentInfoColl
            const grade = {
                '2004A1': 100000,
                '2005A0': 100000,
                '2005A1': 100000,
                '2006A0': 100000,
                '2006A1': 100000,
                '2007A0': 100000,
                '2007A1': 100000,
                '2008A0': 120000,
                '2008A1': 120000,
                '2008A2': 100000,
                '2009A0': 120000,
                '2009A1': 120000,
            };

            const updateDoc = {
                'terms.$.payment': amount + paid,
                'terms.$.type': 'CK',
                'terms.$.paidDate': formatWhenDate,
                'terms.$.remainder': amount + paid - study * grade[classId] + remainderBefore,
            };

            MongoDB.updateOneUser(
                studentInfoColl,
                { studentId: parseInt(studentId), 'terms.term': parseInt(term) },
                { $set: updateDoc }
            );
        }

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const failExtract = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const classColl = db.collection('classUsers');
        const transactionsColl = db.collection('transactions');
        const studentInfoColl = db.collection('studentInfo');
        const quotasColl = db.collection('quotas');
        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                xuLyIdThuCong(client);
            }
        });
        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

async function xuLyIdThuCong(client) {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const ssIdCoPhuTrach = '1-8aVO7j4Pu9vJ9h9ewha18UHA9z6BJy2909g8I1RrPM';

    const getRequest = {
        spreadsheetId: ssIdCoPhuTrach,
        range: 'Giao dịch',
        valueRenderOption: 'UNFORMATTED_VALUE',
    };

    const getResponse = (await sheets.spreadsheets.values.get(getRequest)).data;

    const { values } = getResponse;

    let data = [];
    let clearIndex = [];

    for (let i = 0; i < values.length; i++) {
        const [when, id, tid, description, amount, cuSumBalance, extractId, extractStatus] = values[i];

        if (typeof extractId === 'number' && extractStatus === 'Lỗi') {
            data.push({
                id: id,
                tid: tid,
                description: description + extractId,
                amount: amount,
                cusum_balance: cuSumBalance,
                when: new Date(when),
            });
            clearIndex.push(i + 1);
        } else if (extractId === 'x' && extractStatus === 'Lỗi') {
            clearIndex.push(i + 1);
        }
    }

    // Gui cac giao dich da them Id den server nhu Casso lam
    const URL = `https://clbanhsang.com/casso/`;

    const result = await fetch(URL, {
        method: 'post',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    const jsonResponse = result.json();

    // Clear unnecessary range
    const clearRange = clearIndex.map((v) => `Giao dịch!H${v}`);

    const clearRequest = {
        spreadsheetId: ssIdCoPhuTrach,
        resource: {
            ranges: clearRange,
        },
    };

    sheets.spreadsheets.values.batchClear(clearRequest);
}

async function xyLyTachIdKhongThanhCong(client, uploadTransasction) {
    // upload2CoPhuTrach(client, values)
    const sheets = google.sheets({ version: 'v4', auth: client });
    const ssIdCoPhuTrach = '1-8aVO7j4Pu9vJ9h9ewha18UHA9z6BJy2909g8I1RrPM';

    const appendRequest = {
        spreadsheetId: ssIdCoPhuTrach,
        range: 'Giao dịch',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        responseDateTimeRenderOption: 'FORMATTED_STRING',
        resource: {
            majorDimension: 'ROWS',
            values: uploadTransasction,
        },
    };

    const appendResponse = (await sheets.spreadsheets.values.append(appendRequest)).data;
}

async function xuLyTrenGoogleSheet(
    client,
    uploadTransasction,
    classId,
    term,
    index,
    when,
    amount,
    paid,
    accessToken
) {
    // upload2CoPhuTrach(client, values)
    const sheets = google.sheets({ version: 'v4', auth: client });
    const ssIdCoPhuTrach = '1-8aVO7j4Pu9vJ9h9ewha18UHA9z6BJy2909g8I1RrPM';

    const appendRequest = {
        spreadsheetId: ssIdCoPhuTrach,
        range: 'Giao dịch',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        responseDateTimeRenderOption: 'FORMATTED_STRING',
        resource: {
            majorDimension: 'ROWS',
            values: uploadTransasction,
        },
    };

    const appendResponse = (await sheets.spreadsheets.values.append(appendRequest)).data;

    // chiaVeMoiLop(client, classId, term, index, when, amount)
    const ssId = {
        '2004A1': '1tjS890ZbldMlX6yKbn0EksroCU5Yrpi--6OQ5ll1On4',
        '2005A0': '1BBzudjOkjJT6uf9_Ma0kWSXgzEkRRfXnjibqKoeNciA',
        '2005A1': '19brbUkN4ixYaTP-2D7GNr3WC-U7z7F2Wh60L1SelBM4',
        '2006A0': '1ilhObfLr7qUtbSikDvsewTAAlGyjoXYQT8H10l2vpUg',
        '2006A1': '1CLzrEd-cN6av7Vw7xr64hqqpo_kuZA3Vky7aa6iOfPI',
        '2007A0': '16QAf6B7CLhOGbEHtghtMEq5dE_qn4TcShXEIAwA6t40',
        '2007A1': '1XDIOvL8C7NOWutlCJODnPxpCAlhPfHdSiRaC104EMLI',
        '2008A0': '1Pq4bKmVGSsRqOE2peG-RcoNxKwPFBUGsO4tfYl4w8bE',
        '2008A1': '1zRkYE6rgcQUrbbsgeZcc69SjU1LFCk_i6COYhVCZJV4',
        '2008A2': '1wzEFLknH7bsvSpXVQuGwnhmixBRYdvb38SOUW7IREBg',
        '2009A0': '1a5TOzG08Jpl4XkTHppQMFIHQ7jV4jpfWZeT2psZNmYQ',
        '2009A1': '1mlKSeO-1aSIhTwzXofOO2RwoZ64zx-aTBOIVJ-puU4M',
    };

    const grade = {
        '2004A1': 12,
        '2005A0': 12,
        '2005A1': 12,
        '2006A0': 11,
        '2006A1': 11,
        '2007A0': 10,
        '2007A1': 10,
        '2008A0': 9,
        '2008A1': 9,
        '2008A2': 9,
        '2009A0': 8,
        '2009A1': 8,
    };

    const formatWhen = new Date(when).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    const updateRequest = {
        spreadsheetId: ssId[classId],
        range: `Hocphi_L${grade[classId]}_D${term}!C${index}:E${index}`,
        valueInputOption: 'USER_ENTERED',
        responseDateTimeRenderOption: 'FORMATTED_STRING',
        resource: {
            majorDimension: 'ROWS',
            range: `Hocphi_L${grade[classId]}_D${term}!C${index}:E${index}`,
            values: [[amount + paid, 'CK', formatWhen]],
        },
    };

    const updateResponse = (await sheets.spreadsheets.values.update(updateRequest)).data;

    // kiemTraQuota
    const getRequest = {
        spreadsheetId: ssIdCoPhuTrach,
        range: 'Quota',
    };

    const getResponse = (await sheets.spreadsheets.values.get(getRequest)).data;

    const { values } = getResponse;

    let currentAcc = [];

    for (let i = 0; i < values.length; i++) {
        const [no, account, quota, dayLeft, status, warning] = values[i];
        if (status === 'Đang dùng') {
            const quotaLeft = quota - 1;
            if (quotaLeft < 10) {
                // Gui canh bao qua Zalo toi Admin va Co giao
                const warningMessage = `Hạn mức còn lại là ${quotaLeft}. Cần thực hiện thay đổi ngay!`;
                await ZaloAPI.sendMessage(accessToken, '4966494673333610309', warningMessage);

                currentAcc.push(no, account, quotaLeft, dayLeft, status, 'Chuyển sang tài khoản bên dưới!');
            } else {
                currentAcc.push(no, account, quotaLeft, dayLeft, status, warning);
            }
        }
    }

    const [no, account, quotaLeft, dayLeft, status, warning] = currentAcc;
    const iQuota = parseInt(no, 10);
    const updateQuotaRequest = {
        spreadsheetId: ssIdCoPhuTrach,
        range: `Quota!A${iQuota + 1}:F${iQuota + 1}`,
        valueInputOption: 'USER_ENTERED',
        responseDateTimeRenderOption: 'FORMATTED_STRING',
        resource: {
            majorDimension: 'ROWS',
            range: `Quota!A${iQuota + 1}:F${iQuota + 1}`,
            values: [[no, account, quotaLeft, dayLeft, status, warning]],
        },
    };

    const updateQuotaResponse = (await sheets.spreadsheets.values.update(updateQuotaRequest)).data;
}

async function extractStudentId(str, classColl) {
    let id = 'N/A';

    const extractNum = str.replace(/\D/g, '');
    const extractId = extractNum.match(/200[4,5,6,7,8,9]\d{3}/g);

    if (extractId !== null) {
        for (let i = 0; i < extractId.length; i++) {
            const formatId = parseInt(extractId[i], 10);

            const existId = await MongoDB.findOneUser(
                classColl,
                { studentId: formatId },
                { projection: { _id: 0 } }
            );

            if (existId !== null) id = formatId;
        }
    }
    return id;
}
