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

export const checkOARegister = async (req, res) => {
    const webhook = req.body;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');

        const { sourceId, sheetName, classId, role } = webhook;

        const pipeline = [
            { $match: { 'students.zaloClassId': classId } },
            {
                $project: {
                    _id: 0,
                    zaloUserId: 1,
                    displayName: 1,
                    userPhone: 1,
                    students: {
                        $filter: {
                            input: '$students',
                            as: 'item',
                            cond: {
                                $and: [
                                    {
                                        $eq: ['$$item.zaloClassId', classId],
                                    },
                                    { $eq: ['$$item.role', role] },
                                ],
                            },
                        },
                    },
                },
            },
        ];

        const aggCursor = zaloColl.aggregate(pipeline);

        const result = await aggCursor.toArray();

        let zaloList = [];

        const cursor = classColl.find({ classId: classId }, { projection: { _id: 0 } });

        const studentList = (await cursor.toArray()).reduce((acc, v) => {
            acc[v.studentId] = v.fullName;
            return acc;
        }, {});

        let studentRegisterId = [];

        result.forEach((v) => {
            const { zaloUserId, displayName, userPhone, students } = v;
            students.forEach((e) => {
                const { zaloStudentId, aliasName } = e;
                const studentName = aliasName.slice(3);

                if (studentList[zaloStudentId]) {
                    studentRegisterId.push(zaloStudentId);
                    zaloList.push([
                        zaloUserId,
                        zaloStudentId,
                        studentName,
                        displayName,
                        userPhone,
                        zaloStudentId,
                        studentName,
                    ]);
                } else {
                    zaloList.push([zaloUserId, zaloStudentId, studentName, displayName, userPhone, 'Not found', '']);
                }
            });
        });

        const studentNotRegisterId = Object.keys(studentList).filter((v) => !studentRegisterId.includes(parseInt(v)));

        studentNotRegisterId.forEach((v) => {
            zaloList.push(['', '', '', '', '', v, studentList[v]]);
        });

        zaloList.forEach((v, i) => v.splice(0, 0, i + 1));

        client.authorize(async (err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                const sheets = google.sheets({ version: 'v4', auth: client });
                const range = 'A4:H';
                const offset = 3;

                const requestClear = {
                    spreadsheetId: sourceId,
                    range: `${sheetName}!${range}`,
                };

                const requestUpdate = {
                    spreadsheetId: sourceId,
                    range: `${sheetName}!${range}${offset + zaloList.length}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        majorDimension: 'ROWS',
                        values: zaloList,
                    },
                };

                await sheets.spreadsheets.values.clear(requestClear);

                await sheets.spreadsheets.values.update(requestUpdate);
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const getOAUsers = async (req, res) => {
    const webhook = req.body;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const zaloColl = db.collection('zaloUsers');
        const { sourceId, sheetName, classId } = webhook;

        const pipeline = [
            { $match: { 'students.zaloClassId': classId } },
            {
                $project: {
                    _id: 0,
                    zaloUserId: 1,
                    displayName: 1,
                    userPhone: 1,
                    students: {
                        $filter: {
                            input: '$students',
                            as: 'item',
                            cond: {
                                $and: [
                                    {
                                        $eq: ['$$item.zaloClassId', classId],
                                    },
                                    { $eq: ['$$item.role', 'Phụ huynh'] },
                                ],
                            },
                        },
                    },
                },
            },
        ];

        const aggCursor = zaloColl.aggregate(pipeline);

        const result = await aggCursor.toArray();

        let zaloList = [];

        result.forEach((v) => {
            const { zaloUserId, displayName, students } = v;
            students.forEach((e) => {
                const { zaloStudentId, aliasName } = e;
                const studentName = aliasName.slice(3);

                zaloList.push([zaloUserId, zaloStudentId, studentName, displayName]);
            });
        });

        zaloList.forEach((v, i) => v.splice(0, 0, i + 1));

        client.authorize(async (err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                const sheets = google.sheets({ version: 'v4', auth: client });
                const range = 'A8:F';
                const offset = 7;

                const requestClear = {
                    spreadsheetId: sourceId,
                    range: `${sheetName}!${range}`,
                };

                const requestUpdate = {
                    spreadsheetId: sourceId,
                    range: `${sheetName}!${range}${offset + zaloList.length}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        majorDimension: 'ROWS',
                        values: zaloList,
                    },
                };

                await sheets.spreadsheets.values.clear(requestClear);

                await sheets.spreadsheets.values.update(requestUpdate);
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const getNotPayUsers = async (req, res) => {
    const data = req.body;

    const { sourceId, sheetName, classId } = data;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const classInfoColl = db.collection('classInfo');
        const studentInfoColl = db.collection('studentInfo');
        const zaloColl = db.collection('zaloUsers');

        const result = await classInfoColl.findOne(
            { classId: classId },
            {
                projection: { _id: 0, currentTerm: 1, className: 1, startTerm: 1, endTerm: 1, subjects: 1 },
            }
        );

        if (result === null) {
            console.log(`Class ${classId} not found!`);
            return;
        }

        const { className, startTerm, endTerm, subjects } = result;

        const createStartTerm = Tools.createDate(startTerm);
        const createEndTerm = Tools.createDate(endTerm);

        const weekday1 = subjects[0].day;
        const absent1 = subjects[0].absent;
        const weekday2 = subjects[1].day;
        const absent2 = subjects[1].absent;

        const absent1List = absent1 === null ? [] : absent1;
        const absent2List = absent2 === null ? [] : absent2;

        const duePayment = Tools.getStudyDate(
            createStartTerm,
            createEndTerm,
            weekday1,
            weekday2,
            ...absent1List,
            ...absent2List
        );

        const duePaymentTermOne = duePayment[4];
        const duePaymentOtherTerm = duePayment[2];

        const { currentTerm } = result;

        // Lay danh sach hoc sinh chua nop hoc phi dot x lop y
        const pipeline = [
            {
                $match: {
                    $and: [
                        { classId: classId },
                        {
                            terms: {
                                $elemMatch: {
                                    term: parseInt(currentTerm),
                                    payment: null,
                                    billing: { $type: 'number' },
                                },
                            },
                        },
                    ],
                },
            },
            {
                $project: {
                    _id: 0,
                    studentId: 1,
                    studentName: 1,
                    terms: {
                        $filter: {
                            input: '$terms',
                            as: 'item',
                            cond: {
                                $and: [
                                    { $eq: ['$$item.term', parseInt(currentTerm)] },
                                    { $eq: ['$$item.payment', null] },
                                    { $isNumber: '$$item.billing' },
                                ],
                            },
                        },
                    },
                },
            },
        ];

        const notPayUsers = await studentInfoColl.aggregate(pipeline).toArray();

        // Loc danh sach nhung hoc sinh chua nop hoc phi ma da dki OA
        const notPayRegisterUsersPromises = notPayUsers.map(async (v) => {
            const { terms, studentId } = v;

            if (terms.length === 0) return null;

            const parentZaloList = await Tools.findZaloUserIdFromStudentId(zaloColl, studentId);

            if (parentZaloList.length === 0) return null;

            v.zaloUserId = parentZaloList[0].zaloUserId;
            v.displayName = parentZaloList[0].displayName;

            return v;
        });

        const notPayRegisterUsers = (await Promise.all(notPayRegisterUsersPromises)).filter((user) => user !== null);

        const zaloList = notPayRegisterUsers.map((v, i) => {
            const { studentId, studentName, terms, zaloUserId, displayName } = v;

            const { term, remainderBefore, billing } = terms[0];

            const billingValue = Tools.formatCurrency(billing);

            const remainderBeforeValue =
                remainderBefore === 0
                    ? '0 đ'
                    : remainderBefore > 0
                    ? `thừa ${Tools.formatCurrency(remainderBefore)}`
                    : `thiếu ${Tools.formatCurrency(remainderBefore)}`;

            const duePaymentValue = term === 1 ? duePaymentTermOne : duePaymentOtherTerm;

            const alarmContent = `Câu lạc bộ Toán Ánh Sáng thông báo học phí đợt ${term} của con ${studentName} ${studentId} lớp ${className} như sau:
- Học phí từ đợt trước: ${remainderBeforeValue}
- Học phí phải nộp đợt ${term} này: ${billingValue}
            
Phụ huynh cần hoàn thành học phí trước hạn ngày ${duePaymentValue} cho lớp toán. Trân trọng!`;

            return [
                i + 1,
                zaloUserId,
                studentId,
                studentName,
                displayName,
                className,
                term,
                remainderBeforeValue,
                billingValue,
                duePaymentValue,
                alarmContent,
            ];
        });

        // Tra ve sheet cho tro giang
        client.authorize(async (err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                const sheets = google.sheets({ version: 'v4', auth: client });
                const range = 'A4:K';
                const offset = 3;

                const requestClear = {
                    spreadsheetId: sourceId,
                    range: `${sheetName}!${range}`,
                };

                const requestUpdate = {
                    spreadsheetId: sourceId,
                    range: `${sheetName}!${range}${offset + zaloList.length}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        majorDimension: 'ROWS',
                        values: zaloList,
                    },
                };

                await sheets.spreadsheets.values.clear(requestClear);

                await sheets.spreadsheets.values.update(requestUpdate);
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const alarmNotPayUsers = async (req, res) => {
    const webhook = req.body;

    const { sourceId, sheetName, lastRow } = webhook;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');

        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        client.authorize(async (err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                const sheets = google.sheets({ version: 'v4', auth: client });

                const requestData = {
                    spreadsheetId: sourceId,
                    range: `${sheetName}!R4C1:R${lastRow}C11`,
                };

                const responseData = (await sheets.spreadsheets.values.get(requestData)).data;
                const data = responseData.values;

                for (let i = 0; i < data.length; i++) {
                    const zaloUserId = data[i][1];
                    const term = data[i][6];
                    const alarmContent = data[i][10];

                    const attachMessage = {
                        text: alarmContent,
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: `Thông tin chuyển khoản`,
                                        payload: `#ttck`,
                                        type: 'oa.query.show',
                                    },
                                    {
                                        title: `Cú pháp chuyển khoản`,
                                        payload: `#cpck`,
                                        type: 'oa.query.show',
                                    },
                                    {
                                        title: `Chi tiết học phí đợt ${term}`,
                                        payload: `#hpht`,
                                        type: 'oa.query.show',
                                    },
                                ],
                            },
                        },
                    };

                    // console.log(`Sending message to ${zaloUserId} with content: ${alarmContent}`);

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);
                }
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const getStatistic = async (req, res) => {
    const data = req.body;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');

        const classList = [
            '2006A0',
            '2006A1',
            '2007A0',
            '2007A1',
            '2008A0',
            '2008A1',
            '2009A0',
            '2009A1',
            '2009A2',
            '2010A0',
            '2010A1',
        ];

        const { sourceId, sheetName, role } = data;

        let finalData = [];

        for (let i = 0; i < classList.length; i++) {
            let classId = classList[i];
            const pipeline = [
                { $match: { 'students.zaloClassId': classId } },
                {
                    $project: {
                        _id: 0,
                        zaloUserId: 1,
                        displayName: 1,
                        userPhone: 1,
                        students: {
                            $filter: {
                                input: '$students',
                                as: 'item',
                                cond: {
                                    $and: [
                                        {
                                            $eq: ['$$item.zaloClassId', classId],
                                        },
                                        { $eq: ['$$item.role', role] },
                                    ],
                                },
                            },
                        },
                    },
                },
            ];

            const aggCursor = zaloColl.aggregate(pipeline);

            const result = await aggCursor.toArray();

            let studentRegisterId = [];

            result.forEach((v) => {
                const { students } = v;
                students.forEach((e) => {
                    const { zaloStudentId } = e;
                    studentRegisterId.push(zaloStudentId);
                });
            });

            const cursor = classColl.find({ classId: classId }, { projection: { _id: 0 } });

            const studentList = (await cursor.toArray()).reduce((acc, v) => {
                acc[v.studentId] = v.fullName;
                return acc;
            }, {});

            const studentNotRegisterId = Object.keys(studentList).filter(
                (v) => !studentRegisterId.includes(parseInt(v))
            );

            finalData.push([classId, studentRegisterId.length, studentNotRegisterId.length]);
        }

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                client.authorize(async (err) => {
                    if (err) {
                        console.error(err);
                        return;
                    } else {
                        const sheets = google.sheets({ version: 'v4', auth: client });
                        const range = 'J4:L';
                        const offset = 3;

                        const requestClear = {
                            spreadsheetId: sourceId,
                            range: `${sheetName}!${range}`,
                        };

                        const requestUpdate = {
                            spreadsheetId: sourceId,
                            range: `${sheetName}!${range}${offset + finalData.length}`,
                            valueInputOption: 'USER_ENTERED',
                            resource: {
                                majorDimension: 'ROWS',
                                values: finalData,
                            },
                        };

                        await sheets.spreadsheets.values.clear(requestClear);

                        await sheets.spreadsheets.values.update(requestUpdate);
                    }
                });
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
        // Make sure to disconnect from the MongoDB client
        MongoDB.client.close();
    }
};

/************************************************************* */

const constructTable = (table) => {
    return table.filter(([key, value]) => key && value);
};

export const sendMessage = async (req, res) => {
    const data = req.body;

    const { sourceId, sheetName, sendTo, lastRow, lastCol, type, classId, header, content, ending, table } = data;

    try {
        client.authorize(async (err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                const sheets = google.sheets({ version: 'v4', auth: client });

                const requestData = {
                    spreadsheetId: sourceId,
                    range: `${sheetName}!R7C1:R${lastRow}C${lastCol}`,
                };

                await MongoDB.client.connect();
                const db = MongoDB.client.db('zalo_servers');
                const tokenColl = db.collection('tokens');
                const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

                const responseData = (await sheets.spreadsheets.values.get(requestData)).data;
                const data = responseData.values;
                const heads = data.shift();

                const obj = data.map((r) => heads.reduce((o, k, i) => ((o[k] = r[i] || ''), o), {}));

                let rowsToSend = obj;

                const sendResult = [];

                if (sendTo === 'assistant') {
                    const result = await classInfoColl.findOne(
                        { classId: classId },
                        { projection: { _id: 0, assistants: 1 } }
                    );

                    if (result === null) {
                        console.log(`Class ${classId} not found!`);
                        return;
                    }

                    const { assistants } = result;
                    const { taZaloId } = assistants[0];
                    rowsToSend = [obj[0]];
                }

                for (let i = 0; i < rowsToSend.length; i++) {
                    const row = rowsToSend[i];

                    const zaloUserId = sendTo === 'assistant' ? taZaloId : row['{ZID}'];

                    const messageHeader = fillInTemplateFromObject(header, row);
                    const messageContent = fillInTemplateFromObject(content, row);
                    const messageEnding = fillInTemplateFromObject(ending, row);
                    const messageTable = constructTable(
                        table.map(([key, value]) => [
                            fillInTemplateFromObject(key, row),
                            fillInTemplateFromObject(value, row),
                        ])
                    );

                    const templateType = type === 'Truyền thông' ? 'promotion' : 'transaction_education';
                    const apiUrl =
                        type === 'Truyền thông'
                            ? 'https://openapi.zalo.me/v3.0/oa/message/promotion'
                            : 'https://openapi.zalo.me/v3.0/oa/message/transaction';

                    const attachMessage = {
                        attachment: {
                            type: 'template',
                            payload: {
                                template_type: templateType,
                                language: 'VI',
                                elements: [
                                    {
                                        attachment_id: 'URL image',
                                        type: 'banner',
                                    },
                                    {
                                        type: 'header',
                                        align: 'center',
                                        content: messageHeader,
                                    },
                                    {
                                        type: 'text',
                                        align: 'left',
                                        content: messageContent,
                                    },
                                    {
                                        type: 'table',
                                        content: messageTable.map(([key, value]) => ({ key, value })),
                                    },
                                    {
                                        type: 'text',
                                        align: 'center',
                                        content: messageEnding,
                                    },
                                ],
                            },
                        },
                    };

                    const result = await ZaloAPI.sendPlusMessage(accessToken, zaloUserId, attachMessage, apiUrl);

                    result.error === 0 ? sendResult.push([result.message]) : sendResult.push([result.message]);
                }

                const requestUpdate = {
                    spreadsheetId: sourceId,
                    range: `${sheetName}!F5:F${8 + sendResult.length - 1}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        majorDimension: 'ROWS',
                        values: sendResult,
                    },
                };

                const responseUpdate = (await sheets.spreadsheets.values.update(requestUpdate)).data;

                console.log(responseUpdate);
            }
        });

        res.send('Done');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

// Fill template string with data object
function fillInTemplateFromObject(template, data) {
    let template_string = JSON.stringify(template);

    // Token replacement
    template_string = template_string.replace(/{[^{}]+}/g, (key) => {
        return escapeData(data[key.replace(/[]+/g, '')] || '');
    });
    return JSON.parse(template_string);
}
// Escape cell data to make JSON safe
function escapeData(str) {
    return str
        .replace(/[\\]/g, '\\\\')
        .replace(/[\"]/g, '\\"')
        .replace(/[\/]/g, '\\/')
        .replace(/[\b]/g, '\\b')
        .replace(/[\f]/g, '\\f')
        .replace(/[\n]/g, '\\n')
        .replace(/[\r]/g, '\\r')
        .replace(/[\t]/g, '\\t');
}
