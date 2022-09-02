import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';

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
            await MongoDB.insertOneUser(transactionsColl, doc);

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

            const { terms, studentId, studentName } = result[0];

            const {
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

            const confirmTuition = `Trung tâm Toán Ánh Sáng xác nhận phụ huynh ${studentName} ${studentId} đã nộp thành công học phí đợt ${term} với thông tin như sau:
-----------------------------------
- Thời gian: ${Tools.formatDateTime(when)}
- Hình thức: chuyển khoản
-----------------------------------
- Học phí: ${Tools.formatCurrency(billing)}
- Đã nộp: ${Tools.formatCurrency(amount)}
- Trạng thái: ${tuitionStatus}
-----------------------------------
Nếu thông tin trên chưa chính xác, phụ huynh vui lòng nhắn tin lại cho OA để trung tâm kịp thời xử lý ạ.

Trân trọng cảm ơn quý phụ huynh!`;
            await ZaloAPI.sendMessage(accessToken, '4966494673333610309', confirmTuition);
        }

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

async function extractStudentId(str, classColl) {
    let id = 'N/A';

    const extractNum = str.replace(/\D/g, '');
    const extractId = extractNum.match(/200[4,5,6,7,8,9]\d{3}/g);

    for (let i = 0; i < extractId.length; i++) {
        const formatId = parseInt(extractId[i], 10);

        const existId = await MongoDB.findOneUser(
            classColl,
            { studentId: formatId },
            { projection: { _id: 0 } }
        );

        if (existId !== null) id = formatId;
    }

    return id;
}
