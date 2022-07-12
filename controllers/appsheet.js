import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import { readTokenFromDB, client, insertOneUser } from './mongo.js';

export const appsheetRequest = async (req, res) => {
    try {
        await client.connect();
        const db = client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');

        const { accessToken, refreshToken } = await readTokenFromDB(tokenColl);

        const webhook = req.body;
        for (const property in webhook) {
            if (webhook[property] == '') {
                webhook[property] = null;
            }
        }

        const fullName = `${webhook.firstName} ${webhook.lastName}`.trim();

        const newDoc = {
            studentId: webhook.studentId,
            classId: webhook.classId,
            enrollDate: webhook.enrollDate,
            status: 'Học',
            birthYear: webhook.birthYear,
            fullName: fullName,
            subject: webhook.subject,
            leaveDate: null,
            studentPhone: webhook.studentPhone,
            school: webhook.school,
            studentEmail: webhook.studentEmail,
            firstParentName: webhook.firstParentName,
            firstParentPhone: webhook.firstParentPhone,
            secondParentName: webhook.secondParentName,
            secondParentPhone: webhook.secondParentPhone,
        };

        insertOneUser(classColl, newDoc);

        const successContent = `✅ Thêm mới thành công vào cơ sở dữ liệu!\n\nTên học sinh: ${fullName}\nMã lớp: ${classId}\nID HS: ${studentId}`;
        ZaloAPI.sendMessage(accessToken, '4966494673333610309', successContent);

        res.send('Success');
        return;
    } catch (err) {
        console.error(err);
    } finally {
    }
};
