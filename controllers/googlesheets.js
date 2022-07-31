import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';

export const getListUser = async (req, res) => {
    const data = req.body;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const zaloColl = db.collection('zaloUsers');

        const { classIds, status, role } = data;

        let classCheckList = [];
        if (status === 'Đang học') {
            classCheckList = [...classIds];
        } else if (status === 'Đã nghỉ') {
            classIds.forEach((v) => classCheckList.push([`N${v[0]}`, v[1]]));
        } else {
            classCheckList = [...classIds];
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
                                    $eq: ['$$item.zaloClassId', classId],
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

                    zaloList.push({
                        zaloUserId: zaloUserId,
                        displayName: displayName,
                        role: role,
                        studentId: zaloStudentId,
                        studentName: studentName,
                        classId: zaloClassId,
                        className: className,
                    });
                });
            });
        }

        res.send(zaloList);
    } catch (err) {
        console.error(err);
    } finally {
    }
};
