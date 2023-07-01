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
                const range = 'A5:E';
                const offset = 4;

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
                projection: { _id: 0, currentTerm: 1 },
            }
        );

        if (result === null) {
            console.log(`Class ${classId} not found!`);
            return;
        }

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

            const { billing } = terms[0];

            const formatBilling = Tools.formatCurrency(billing);

            return [i + 1, zaloUserId, studentId, studentName, displayName, formatBilling];
        });

        // Tra ve sheet cho tro giang

        client.authorize(async (err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                const sheets = google.sheets({ version: 'v4', auth: client });
                const range = 'A5:F';
                const offset = 4;

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

    const { sourceId, sheetName, classId, lastRow } = webhook;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const classInfoColl = db.collection('classInfo');
        const studentInfoColl = db.collection('studentInfo');
        const zaloColl = db.collection('zaloUsers');
        const tokenColl = db.collection('tokens');

        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

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

        client.authorize(async (err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                const sheets = google.sheets({ version: 'v4', auth: client });
                const range = 'A5:F';
                const offset = 4;

                const requestData = {
                    spreadsheetId: sourceId,
                    range: `${sheetName}!R5C2:R${lastRow}C2`,
                };

                const responseData = (await sheets.spreadsheets.values.get(requestData)).data;
                const data = responseData.values;

                console.log(data);
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

export const sendMessageDemo = async (req, res) => {
    const webhook = req.body;

    try {
        client.authorize(async (err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                await MongoDB.client.connect();
                const db = MongoDB.client.db('zalo_servers');
                const classInfoColl = db.collection('classInfo');
                const tokenColl = db.collection('tokens');

                const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

                const { sourceId, sheetName, classId, template, lastCol } = webhook;

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

                const sheets = google.sheets({ version: 'v4', auth: client });

                const requestData = {
                    spreadsheetId: sourceId,
                    range: `${sheetName}!R4C1:R5C${lastCol}`,
                };

                const responseData = (await sheets.spreadsheets.values.get(requestData)).data;
                const data = responseData.values;
                const heads = data.shift();

                const obj = data.map((r) => heads.reduce((o, k, i) => ((o[k] = r[i] || ''), o), {}));

                // Loops through all the rows of data
                for (let i = 0; i < obj.length; i++) {
                    const row = obj[i];
                    const content = fillInTemplateFromObject(template, row);

                    console.log(`Sending message to ${taZaloId} with content: ${content}`);

                    // await ZaloAPI.sendMessage(accessToken, taZaloId, content);
                }
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

/************************************************************* */

export const sendBulk = async (req, res) => {
    const data = req.body;

    const { sourceId, sheetName, lastCol, lastRow, template } = data;

    try {
        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                sendMessageBulk(client, sourceId, sheetName, lastCol, lastRow, template);
            }
        });

        res.send('Done');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const getIncludeUser = async (req, res) => {
    const data = req.body;
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const zaloColl = db.collection('zaloUsers');
        const classInfoColl = db.collection('classInfo');

        const { sourceId, sheetName, studentIds, role } = data;

        let zaloList = [];

        for (let i = 0; i < studentIds.length; i++) {
            const studentId = studentIds[i];

            const pipeline = [
                { $match: { 'students.zaloStudentId': parseInt(studentId) } },
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
                                            $eq: ['$$item.zaloStudentId', parseInt(studentId)],
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

            if (result.length === 0) continue; // Neu hoc sinh khong co tren CSDL

            for (let i = 0; i < result.length; i++) {
                const { zaloUserId, displayName, userPhone, students } = result[i];

                for (let v = 0; v < students.length; v++) {
                    const { zaloStudentId, zaloClassId, aliasName, role } = students[v];
                    const studentName = aliasName.slice(3);

                    const resutlClassId = await MongoDB.findOneUser(
                        classInfoColl,
                        { classId: zaloClassId },
                        { projection: { _id: 0, className: 1 } }
                    );

                    if (resutlClassId === null) continue;
                    const { className } = resutlClassId;

                    zaloList.push([zaloUserId, displayName, studentName, role, zaloStudentId, zaloClassId, className]);
                }
            }
        }

        zaloList.forEach((v, i) => v.splice(0, 0, i + 1));

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                getUserBulk(client, sourceId, sheetName, zaloList);
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

async function sendMessageBulk(client, sourceId, sheetName, lastCol, lastRow, template) {
    const sheets = google.sheets({ version: 'v4', auth: client });

    const requestData = {
        spreadsheetId: sourceId,
        range: `${sheetName}!R7C1:R${lastRow}C${lastCol}`,
    };

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');

        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        const responseData = (await sheets.spreadsheets.values.get(requestData)).data;
        const data = responseData.values;
        const heads = data.shift();

        const obj = data.map((r) => heads.reduce((o, k, i) => ((o[k] = r[i] || ''), o), {}));
        // Creates an array to record sent zalo message
        const out = [];

        // Loops through all the rows of data
        for (let i = 0; i < obj.length; i++) {
            const row = obj[i];
            const zaloUserId = row['{ZID}'];

            const content = fillInTemplateFromObject(template, row);

            const result = await ZaloAPI.sendMessage(accessToken, zaloUserId, content);

            result.error === 0 ? out.push([result.message]) : out.push([result.message]);
        }

        const requestUpdate = {
            spreadsheetId: sourceId,
            range: `${sheetName}!I8:I${8 + out.length - 1}`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                majorDimension: 'ROWS',
                values: out,
            },
        };

        const responseUpdate = (await sheets.spreadsheets.values.update(requestUpdate)).data;

        console.log(responseUpdate);
    } catch (err) {
        console.error(err);
    }
}

async function getUserBulk(client, sourceId, sheetName, zaloList) {
    const sheets = google.sheets({ version: 'v4', auth: client });

    const totalList = zaloList.length;

    const requestClear = {
        spreadsheetId: sourceId,
        range: `${sheetName}!A8:Z`,
    };

    const requestUpdate = {
        spreadsheetId: sourceId,
        range: `${sheetName}!A8:H${8 + totalList - 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            majorDimension: 'ROWS',
            values: zaloList,
        },
    };

    try {
        await sheets.spreadsheets.values.clear(requestClear);

        await sheets.spreadsheets.values.update(requestUpdate);
    } catch (err) {
        console.error(err);
    }
}

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
