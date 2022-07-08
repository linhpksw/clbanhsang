import { findOneUser, updateOneUser } from './mongo.js';
import * as ZaloAPI from './zalo.js';
import { updateTokenInDB } from './mongo.js';

function xoaDauTiengViet(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

function nomarlizeSyntax(str) {
    return xoaDauTiengViet(str).toLowerCase().replace(/\s+/g, '');
}

async function sendBack2Client(res, tokenColl, refreshToken) {
    await res.send('Done!');
    await updateTokenInDB(tokenColl, refreshToken);
}

async function deleteAccount() {
    if (formatSyntax.length !== 21) {
        await ZaloAPI.sendHeartReaction(
            accessToken,
            zaloUserId,
            messageId,
            'sad'
        );
        await ZaloAPI.sendMessage(
            accessToken,
            zaloUserId,
            `❌ Đăng kí thất bại!\n\nCú pháp không đúng. ${quyen} hãy nhập lại.`
        );

        await sendBack2Client(res, tokenColl, refreshToken);

        return;
    }
}

async function signUp(
    res,
    accessToken,
    refreshToken,
    zaloUserId,
    zaloColl,
    classColl,
    tokenColl,
    formatSyntax,
    messageId,
    quyen
) {
    if (formatSyntax.length !== 21) {
        await ZaloAPI.sendHeartReaction(
            accessToken,
            zaloUserId,
            messageId,
            'sad'
        );
        await ZaloAPI.sendMessage(
            accessToken,
            zaloUserId,
            `❌ Đăng kí thất bại!\n\nCú pháp không đúng. ${quyen} hãy nhập lại.`
        );

        await sendBack2Client(res, tokenColl, refreshToken);

        return;
    }
    // kiem tra tren zalo collection
    const { role, displayName } = await findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, role: 1, displayName: 1 } }
    );

    if (role !== null) {
        await ZaloAPI.sendHeartReaction(
            accessToken,
            zaloUserId,
            messageId,
            'like'
        );
        await ZaloAPI.sendMessage(
            accessToken,
            zaloUserId,
            `Tài khoản đã có trên hệ thống. ${quyen} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`
        );

        await sendBack2Client(res, tokenColl, refreshToken);

        return;
    }

    // kiem tra tren classes collection
    const studentId = parseInt(formatSyntax.substring(4, 11));
    const registerPhone = formatSyntax.slice(-10);

    const userInfo = await findOneUser(
        classColl,
        { studentID: studentId },
        {
            projection: {
                _id: 0,
                fullName: 1,
                classID: 1,
                leaveDate: 1,
                studentPhone: 1,
                firstParentPhone: 1,
                secondParentPhone: 1,
            },
        }
    );

    if (userInfo === null) {
        await ZaloAPI.sendHeartReaction(
            accessToken,
            zaloUserId,
            messageId,
            'sad'
        );
        await ZaloAPI.sendMessage(
            accessToken,
            zaloUserId,
            `❌ Đăng kí thất bại!\n\nMã học sinh ${studentId} không có trên hệ thống. ${quyen} hãy liên hệ với trợ giảng để được hỗ trợ.`
        );

        await sendBack2Client(res, tokenColl, refreshToken);

        return;
    }

    let {
        firstParentPhone,
        secondParentPhone,
        studentPhone,
        fullName,
        classID,
        leaveDate,
    } = userInfo;

    let registerPhoneList;
    if (quyen === 'Phụ huynh') {
        registerPhoneList = [firstParentPhone, secondParentPhone];
    } else {
        registerPhoneList = [studentPhone];
    }

    if (!registerPhoneList.includes(registerPhone)) {
        await ZaloAPI.sendHeartReaction(
            accessToken,
            zaloUserId,
            messageId,
            'sad'
        );
        await ZaloAPI.sendMessage(
            accessToken,
            zaloUserId,
            `❌ Đăng kí thất bại!\n\nSố điện thoại ${registerPhone} chưa có trong danh sách đã đăng kí. ${quyen} hãy liên hệ với trợ giảng để được hỗ trợ.`
        );

        await sendBack2Client(res, tokenColl, refreshToken);

        return;
    }
    // set up role cho zalo user
    await ZaloAPI.sendHeartReaction(
        accessToken,
        zaloUserId,
        messageId,
        'heart'
    );
    await ZaloAPI.sendMessage(
        accessToken,
        zaloUserId,
        `✅ Đăng kí thành công!\n\nZalo ${displayName} đã được liên kết với học sinh: ${fullName}. Mã ID: ${studentId}\nTừ bây giờ, ${quyen} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`
    );
    let status;
    leaveDate === null ? (status = 'Đang học') : (status = 'Nghỉ học');

    const newDoc = {
        aliasName: `PH ${fullName}`,
        userPhone: `${registerPhone}`,
        role: quyen,
        status: status,
        classId: classID.slice(-7),
        studentId: studentId,
    };

    const filter = { zaloUserId: `${zaloUserId}` };
    const updateDoc = {
        $set: newDoc,
    };
    await updateOneUser(zaloColl, filter, updateDoc);

    await ZaloAPI.tagFollower(accessToken, zaloUserId, quyen);
    await ZaloAPI.tagFollower(accessToken, zaloUserId, classID);
    await ZaloAPI.tagFollower(accessToken, zaloUserId, status);

    await sendBack2Client(res, tokenColl, refreshToken);

    return;
}

async function forceFollowOA(accessToken, zaloUserId) {
    const notFollowContent =
        'PHHS vui lòng nhấn quan tâm OA để sử dụng đầy đủ những tính năng của lớp toán.';
    await ZaloAPI.sendMessage(accessToken, zaloUserId, notFollowContent);
}

export { nomarlizeSyntax, forceFollowOA, signUp };
