import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { google } from 'googleapis';

const CLIENT_EMAIL = process.env.CLIENT_EMAIL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCOPE = process.env.SCOPE;

const client = new google.auth.JWT(CLIENT_EMAIL, null, PRIVATE_KEY, [SCOPE]);

export const getListUser = async (req, res) => {
    const data = req.body;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const zaloColl = db.collection('zaloUsers');

        const { sourceId, classIds, status, role } = data;

        let classCheckList = [];
        if (status === 'Đang học') {
            classCheckList = [...classIds];
        } else {
            classIds.forEach((v) => classCheckList.push([`N${v[0]}`, v[1]]));
        }

        let zaloList = [];

        for (let i = 0; i < classCheckList.length; i++) {
            const [classId, className] = classCheckList[i];

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
                                        { $eq: ['$$item.zaloClassId', classId] },
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

            if (result.length === 0) continue; // Neu ma lop khong co tren CSDL

            result.forEach((v) => {
                const { zaloUserId, displayName, userPhone, students } = v;
                students.forEach((e) => {
                    const { zaloStudentId, zaloClassId, aliasName, role } = e;
                    const studentName = aliasName.slice(3);

                    // zaloList.push({
                    //     zaloUserId: zaloUserId,
                    //     displayName: displayName,
                    //     role: role,
                    //     studentId: zaloStudentId,
                    //     studentName: studentName,
                    //     classId: zaloClassId,
                    //     className: className,
                    // });

                    zaloList.push([
                        zaloUserId,
                        displayName,
                        role,
                        zaloStudentId,
                        studentName,
                        zaloClassId,
                        className,
                    ]);
                });
            });
        }

        zaloList.forEach((v, i) => v.splice(0, 0, i + 1));

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                writeListUser(client, sourceId, zaloList);
            }
        });

        res.send(zaloList);
    } catch (err) {
        console.error(err);
    } finally {
    }
};

async function writeListUser(client, sourceId, zaloList) {
    const sheets = google.sheets({ version: 'v4', auth: client });

    const totalList = zaloList.length;

    const request = {
        spreadsheetId: sourceId,
        range: `A8:H${8 + totalList - 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            majorDimension: 'ROWS',
            values: zaloList,
        },
    };

    try {
        const response = (await sheets.spreadsheets.values.update(request)).data;

        console.log(JSON.stringify(response, null, 2));
    } catch (err) {
        console.error(err);
    }
}
