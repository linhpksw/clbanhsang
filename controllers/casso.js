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

        console.log(data);

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

            // Neu tach khong thanh cong
            if (extractId === 'N/A') {
                // do something
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

            let tuitionStatus;
            if (amount === billing) {
                tuitionStatus = '✅ nộp đủ học phí';
            } else if (amount > billing) {
                const diff = amount - billing;
                tuitionStatus = `🔔 nộp thừa ${Tools.formatCurrency(diff)}`;
            } else {
                const diff = billing - amount;
                tuitionStatus = `❌ nộp thiếu ${Tools.formatCurrency(diff)}`;
            }

            const formatWhen = new Date(when).toLocaleString('vi-VN', {
                hour: 'numeric',
                minute: 'numeric',
                day: 'numeric',
                month: 'numeric',
                year: 'numeric',
            });
            const confirmTuition = `Trung tâm Toán Ánh Sáng xác nhận phụ huynh ${studentName} ${studentId} đã nộp thành công học phí đợt ${term} với thông tin như sau:
-----------------------------------
- Thời gian: ${formatWhen}
- Hình thức: chuyển khoản
-----------------------------------
- Học phí: ${Tools.formatCurrency(billing)}
- Đã nộp: ${Tools.formatCurrency(amount)}
- Trạng thái: ${tuitionStatus}
-----------------------------------
Nếu thông tin trên chưa chính xác, phụ huynh vui lòng nhắn tin lại cho OA để trung tâm kịp thời xử lý ạ.

Trân trọng cảm ơn quý phụ huynh!`;

            // Gui tin nhan xac nhan den phu huynh
            await ZaloAPI.sendMessage(accessToken, '4966494673333610309', confirmTuition);

            // Day len Co Phu Trach (sheet Giao dịch) + Chia ve moi lop
            const uploadTransasction = [[when, id, tid, description, amount, cusum_balance, extractId]];
            client.authorize((err) => {
                if (err) {
                    console.error(err);
                    return;
                } else {
                    xuLyTrenGoogleSheet(client, uploadTransasction, classId, term, index, when, amount);
                }
            });
        }

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

async function xuLyTrenGoogleSheet(client, values, classId, term, index, when, amount) {
    // upload2CoPhuTrach(client, values)
    const sheets = google.sheets({ version: 'v4', auth: client });

    const appendRequest = {
        spreadsheetId: '1-8aVO7j4Pu9vJ9h9ewha18UHA9z6BJy2909g8I1RrPM',
        range: 'Giao dịch',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        responseDateTimeRenderOption: 'FORMATTED_STRING',
        resource: {
            majorDimension: 'ROWS',
            values: values,
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
            values: [[amount, 'CK', formatWhen]],
        },
    };

    const updateResponse = (await sheets.spreadsheets.values.update(updateRequest)).data;
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
