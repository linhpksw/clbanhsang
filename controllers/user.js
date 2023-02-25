import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';
// async function insertToZaloDB() {
//     try {
//         await MongoDB.client.connect();
//         const db = MongoDB.client.db('zalo_servers');
//         const tokenColl = db.collection('tokens');
//         const zaloColl = db.collection('zaloUsers');

//         const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

//         const followers = await ZaloAPI.getFollowers(accessToken);

//         // console.log(followers);
//         // return;

//         await MongoDB.insertManyToDB(zaloColl, followers);

//         console.log('Success!');
//     } catch (err) {
//         console.error(err);
//     } finally {
//     }
// }

// insertToZaloDB();

export const userRequest = async (req, res) => {
    const webhook = req.body;

    const eventName = webhook.event_name;
    const unixTimestamp = parseInt(webhook.timestamp);
    const localeTimeStamp = Tools.formatDateTime(unixTimestamp);

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');
        const classInfoColl = db.collection('classInfo');
        const studentInfoColl = db.collection('studentInfo');

        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        let zaloUserId;

        switch (eventName) {
            case 'user_click_chatnow':
                zaloUserId = webhook.user_id;

                if (!(await Tools.isFollow(zaloUserId, zaloColl))) {
                    ZaloAPI.tagFollower(
                        accessToken,
                        zaloUserId,
                        'Chưa quan tâm'
                    );
                }
                break;

            case 'follow':
                zaloUserId = webhook.follower.id;

                const isExistInZaloColl = await MongoDB.findOneUser(
                    zaloColl,
                    { zaloUserId: `${zaloUserId}` },
                    { projection: { _id: 0 } }
                );

                // Neu nguoi dung quan tam lan dau
                if (isExistInZaloColl === null) {
                    const profileDoc = await ZaloAPI.getProfile(
                        accessToken,
                        zaloUserId
                    );

                    // console.log(`${profileDoc.displayName} quan tâm OA (${profileDoc.zaloUserId})`);

                    await ZaloAPI.removeFollowerFromTag(
                        accessToken,
                        zaloUserId,
                        'Chưa quan tâm'
                    );
                    await ZaloAPI.tagFollower(
                        accessToken,
                        zaloUserId,
                        'Chưa đăng kí'
                    );

                    MongoDB.insertOneUser(zaloColl, profileDoc);
                }

                // Nguoi dung quan tam tro lai
                else {
                    MongoDB.updateOneUser(
                        zaloColl,
                        { zaloUserId: `${zaloUserId}` },
                        { $set: { status: 'follow' } }
                    );

                    if (isExistInZaloColl.userPhone === null) {
                        await ZaloAPI.removeFollowerFromTag(
                            accessToken,
                            zaloUserId,
                            'Chưa quan tâm'
                        );
                        await ZaloAPI.tagFollower(
                            accessToken,
                            zaloUserId,
                            'Chưa đăng kí'
                        );
                    } else {
                        await ZaloAPI.removeFollowerFromTag(
                            accessToken,
                            zaloUserId,
                            'Chưa quan tâm'
                        );
                    }

                    // console.log('Nguời dùng quan tâm trở lại');
                }

                res.send('Done!');

                break;

            case 'unfollow':
                zaloUserId = webhook.follower.id;

                await ZaloAPI.removeFollowerFromTag(
                    accessToken,
                    zaloUserId,
                    'Chưa đăng kí'
                );
                await ZaloAPI.tagFollower(
                    accessToken,
                    zaloUserId,
                    'Chưa quan tâm'
                );

                MongoDB.updateOneUser(
                    zaloColl,
                    { zaloUserId: `${zaloUserId}` },
                    { $set: { status: 'unfollow' } }
                );

                res.send('Done!');

                break;

            case 'user_reacted_message':
                zaloUserId = webhook.sender.id;

                // Check xem tha tym den OA co tu phia Tro giang khong
                const isAssistant = await Tools.isManagerCheck(
                    zaloUserId,
                    classInfoColl
                );

                // Neu tu phia tro giang thi chuyen tiep tym lai cho phu huynh
                if (isAssistant) {
                    const reactMessageId = webhook.message.msg_id;

                    const reactIcon = webhook.message.react_icon;

                    await Tools.sendReactBack2Parent(
                        accessToken,
                        zaloUserId,
                        reactMessageId,
                        reactIcon,
                        zaloColl
                    );
                }

                res.send('Done!');

                break;

            case 'user_send_image':
                zaloUserId = webhook.sender.id;

                const imageInfo = webhook.message;

                // Check xem nguoi dung da follow OA chua
                const isFollowImage = await Tools.isFollow(
                    zaloUserId,
                    zaloColl
                );

                // Neu da follow
                if (isFollowImage) {
                    const isManager = await Tools.isManagerCheck(
                        zaloUserId,
                        classInfoColl
                    );

                    // Neu tu phia tro giang thi phan hoi lai tin nhan hinh anh cho phu huynh
                    if (isManager) {
                        await Tools.sendImageBack2Parent(
                            accessToken,
                            imageInfo,
                            zaloColl
                        );

                        res.send('Done!');
                    }

                    // Neu tu phia phu huynh thi phan hoi lai tin nhan hinh anh cho tro giang
                    else {
                        await Tools.forwardImage2Assistant(
                            res,
                            accessToken,
                            zaloUserId,
                            zaloColl,
                            classInfoColl,
                            imageInfo
                        );

                        const mediaInfo = webhook.message;

                        await Tools.forwardOtherMedia2Assistant(
                            res,
                            accessToken,
                            zaloUserId,
                            zaloColl,
                            classInfoColl,
                            mediaInfo
                        );
                    }
                }

                // Neu chua follow
                else {
                    await ZaloAPI.tagFollower(
                        accessToken,
                        zaloUserId,
                        'Chưa quan tâm'
                    );

                    res.send('Done!');
                }

                break;

            case 'user_send_text':
                zaloUserId = webhook.sender.id;

                const messageId = webhook.message.msg_id;
                const content = webhook.message.text;

                const formatContent = Tools.nomarlizeSyntax(content);

                const isFollowOA = await Tools.isFollow(zaloUserId, zaloColl);

                if (isFollowOA) {
                    // Kiem tra cu phap co phai tra cuu khong
                    const isSyntax = formatContent.includes('#');

                    const isDKPH = formatContent.slice(0, 4) === 'dkph';
                    const isDKHS = formatContent.slice(0, 4) === 'dkhs';
                    const isXPH = formatContent.slice(0, 3) === 'xph';
                    const isXHS = formatContent.slice(0, 3) === 'xhs';
                    const isDKTG = formatContent.slice(0, 4) === 'dktg';

                    if (isDKPH) {
                        Tools.signUp(
                            accessToken,
                            zaloUserId,
                            zaloColl,
                            classColl,
                            classInfoColl,
                            formatContent,
                            messageId,
                            'Phụ huynh'
                        );

                        res.send('Done');
                    } else if (isDKHS) {
                        Tools.signUp(
                            accessToken,
                            zaloUserId,
                            zaloColl,
                            classColl,
                            classInfoColl,
                            formatContent,
                            messageId,
                            'Học sinh'
                        );
                    } else if (isXPH) {
                        Tools.deleteAccount(
                            formatContent,
                            accessToken,
                            zaloUserId,
                            zaloColl,
                            classInfoColl,
                            messageId,
                            'Phụ huynh'
                        );

                        res.send('Done!');
                    } else if (isXHS) {
                        Tools.deleteAccount(
                            formatContent,
                            accessToken,
                            zaloUserId,
                            zaloColl,
                            classInfoColl,
                            messageId,
                            'Học sinh'
                        );

                        res.send('Done!');
                    } else if (isDKTG) {
                        Tools.signUp4Assistant(
                            res,
                            accessToken,
                            zaloUserId,
                            classInfoColl,
                            zaloColl,
                            content,
                            messageId
                        );
                    } else if (!isSyntax) {
                        // Check xem tin nhan den OA co tu phia Tro giang khong
                        const isManager = await Tools.isManagerCheck(
                            zaloUserId,
                            classInfoColl
                        );

                        // Neu tu phia tro giang thi phan hoi lai cho phu huynh
                        if (isManager) {
                            const quoteMessageId =
                                webhook.message.quote_msg_id || null;

                            if (quoteMessageId !== null) {
                                const replyContent = webhook.message.text;

                                await Tools.sendMessageBack2Parent(
                                    accessToken,
                                    zaloUserId,
                                    replyContent,
                                    quoteMessageId,
                                    zaloColl
                                );
                            }
                        }

                        // Neu tu phia phu huynh thi phan hoi lai cho tro giang
                        else {
                            await Tools.forwardMessage2Assistant(
                                accessToken,
                                zaloUserId,
                                messageId,
                                zaloColl,
                                classInfoColl,
                                content
                            );
                        }

                        res.send('Done');
                    } else if (isSyntax) {
                        /*  Cac tinh nang tra cuu */

                        const isDKTK = formatContent === '#dktk';
                        const isVTDK = formatContent === '#vtdk';
                        const isDKPH = formatContent === '#dkph';
                        const isDKHS = formatContent === '#dkhs';
                        const isTTCL = formatContent === '#ttcl';
                        const isDC = formatContent === '#dc';
                        const isTHCS = formatContent === '#thcs';
                        const isK8 = formatContent === '#k8';
                        const isK9 = formatContent === '#K9';
                        const isTHPT = formatContent === '#thpt';
                        const isK10 = formatContent === '#k10';
                        const isK11 = formatContent === '#k11';
                        const isK12 = formatContent === '#k12';
                        const isTTL =
                            formatContent.substring(0, 5) === '#tt20' &&
                            formatContent.length === 9;

                        const isLDH = formatContent === '#ldh';
                        const isHPHT = formatContent === '#hpht';
                        const isTTCK = formatContent === '#ttck';
                        const isCPCK = formatContent === '#cpck';
                        const isDDHT = formatContent === '#ddht';
                        const isLHTG = formatContent === '#lhtg';

                        const isCheckDKPH =
                            formatContent.slice(0, 5) === '#dkph' &&
                            formatContent.length === 11;
                        const isCheckCDKPH =
                            formatContent.slice(0, 6) === '#cdkph' &&
                            formatContent.length === 12;
                        const isCheckDKHS =
                            formatContent.slice(0, 5) === '#dkhs' &&
                            formatContent.length === 11;
                        const isCheckCDKHS =
                            formatContent.slice(0, 6) === '#cdkhs' &&
                            formatContent.length === 12;

                        // const isCNH = formatContent.slice(0, 4) === '#cnh' && formatContent.length === 10;
                        // const isCNHPH = formatContent.slice(0, 6) === '#cnhph' && formatContent.length === 12;
                        // const isExCludeCNHPH =
                        //     formatContent.slice(0, 6) === '#cnhph' &&
                        //     formatContent.slice(0, 13).length === 13 &&
                        //     formatContent.slice(12, 13) === '-';

                        // const isIncludeCNHPH =
                        //     formatContent.slice(0, 6) === '#cnhph' &&
                        //     formatContent.slice(0, 13).length === 13 &&
                        //     formatContent.slice(12, 13) === '+';

                        switch (true) {
                            case isDKTK:
                                await Tools.signUpAlert(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    zaloColl
                                );
                                break;

                            case isVTDK:
                                await Tools.signUpRole(
                                    res,
                                    accessToken,
                                    zaloUserId
                                );
                                break;

                            case isDKPH:
                                await Tools.signUp4Parent(
                                    res,
                                    accessToken,
                                    zaloUserId
                                );
                                break;

                            case isDKHS:
                                await Tools.signUp4Student(
                                    res,
                                    accessToken,
                                    zaloUserId
                                );
                                break;

                            case isTTCL: {
                                const attachMessage = {
                                    text: 'Hiện tại lớp toán đang tổ chức cả 2 khối THCS và THPT. Cụ thể, khối THCS ôn luyện toán từ lớp 8 đến lớp 9 còn khối THPT là từ lớp 10 đến lớp 12.\nPhụ huynh có nhu cầu đăng kí cho con khối nào ạ?',
                                    attachment: {
                                        type: 'template',
                                        payload: {
                                            buttons: [
                                                {
                                                    title: 'Tôi muốn đăng kí khối THCS',
                                                    payload: '#thcs',
                                                    type: 'oa.query.show',
                                                },
                                                {
                                                    title: 'Tôi muốn đăng kí khối THPT',
                                                    payload: '#thpt',
                                                    type: 'oa.query.show',
                                                },
                                            ],
                                        },
                                    },
                                };

                                await ZaloAPI.sendMessageWithButton(
                                    accessToken,
                                    zaloUserId,
                                    attachMessage
                                );

                                res.send('Done!');

                                break;
                            }

                            case isDC: {
                                const attachMessage = {
                                    text: `Trung tâm toán Câu lạc bộ Ánh Sáng có địa chỉ tại trường THPT Lê Hồng Phong, số 27 Tô Hiệu, Nguyễn Trãi, Hà Đông.`,
                                    attachment: {
                                        type: 'template',
                                        payload: {
                                            buttons: [
                                                {
                                                    title: 'Xem cụ thể trên bản đồ',
                                                    payload: {
                                                        url: 'https://goo.gl/maps/3NnMdTo7x2RYDxMG9',
                                                    },
                                                    type: 'oa.open.url',
                                                },
                                            ],
                                        },
                                    },
                                };

                                await ZaloAPI.sendMessageWithButton(
                                    accessToken,
                                    zaloUserId,
                                    attachMessage
                                );

                                res.send('Done!');

                                break;
                            }

                            case isTHCS: {
                                const attachMessage = {
                                    text: 'Phụ huynh chọn khối con muốn theo học?',
                                    attachment: {
                                        type: 'template',
                                        payload: {
                                            buttons: [
                                                {
                                                    title: 'Khối 8',
                                                    payload: '#k8',
                                                    type: 'oa.query.show',
                                                },
                                                {
                                                    title: 'Khối 9',
                                                    payload: '#k9',
                                                    type: 'oa.query.show',
                                                },
                                            ],
                                        },
                                    },
                                };

                                await ZaloAPI.sendMessageWithButton(
                                    accessToken,
                                    zaloUserId,
                                    attachMessage
                                );

                                res.send('Done!');

                                break;
                            }

                            case isK8: {
                                const attachMessage = {
                                    text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 8 ôn thi vào chuyên toán, có kiểm tra đầu vào để xếp lớp.\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                                    attachment: {
                                        type: 'template',
                                        payload: {
                                            buttons: [
                                                {
                                                    title: 'Lớp 8A0 chuyên toán',
                                                    payload: '#tt2009A0',
                                                    type: 'oa.query.show',
                                                },
                                                {
                                                    title: 'Lớp 8A1 chuyên toán',
                                                    payload: '#tt2009A1',
                                                    type: 'oa.query.show',
                                                },
                                            ],
                                        },
                                    },
                                };

                                await ZaloAPI.sendMessageWithButton(
                                    accessToken,
                                    zaloUserId,
                                    attachMessage
                                );

                                res.send('Done!');

                                break;
                            }

                            case isK9: {
                                const attachMessage = {
                                    text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 9 ôn thi vào chuyên toán; 1 lớp 9 nâng cao ôn toán điều kiện vào 10.\nĐối với 2 lớp 9 ôn thi chuyên, các con sẽ phải làm một bài kiểm tra đầu vào để được xếp lớp. Với lớp toán nâng cao, ôn toán điều kiện thì không cần kiểm tra xếp lớp.\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                                    attachment: {
                                        type: 'template',
                                        payload: {
                                            buttons: [
                                                {
                                                    title: 'Lớp 9A0 chuyên toán + chuyên tin',
                                                    payload: '#TT2008A0',
                                                    type: 'oa.query.show',
                                                },
                                                {
                                                    title: 'Lớp 9A1 chuyên toán + chuyên tin',
                                                    payload: '#TT2008A1',
                                                    type: 'oa.query.show',
                                                },
                                                {
                                                    title: 'Lớp 9A2 toán điều kiện và nâng cao',
                                                    payload: '#TT2008A2',
                                                    type: 'oa.query.show',
                                                },
                                            ],
                                        },
                                    },
                                };

                                await ZaloAPI.sendMessageWithButton(
                                    accessToken,
                                    zaloUserId,
                                    attachMessage
                                );

                                res.send('Done!');

                                break;
                            }

                            case isTHPT: {
                                const attachMessage = {
                                    text: 'Phụ huynh chọn khối con muốn theo học?',
                                    attachment: {
                                        type: 'template',
                                        payload: {
                                            buttons: [
                                                {
                                                    title: 'Khối 10',
                                                    payload: '#k10',
                                                    type: 'oa.query.show',
                                                },
                                                {
                                                    title: 'Khối 11',
                                                    payload: '#k11',
                                                    type: 'oa.query.show',
                                                },
                                                {
                                                    title: 'Khối 12',
                                                    payload: '#k12',
                                                    type: 'oa.query.show',
                                                },
                                            ],
                                        },
                                    },
                                };

                                await ZaloAPI.sendMessageWithButton(
                                    accessToken,
                                    zaloUserId,
                                    attachMessage
                                );

                                res.send('Done!');

                                break;
                            }

                            case isK10: {
                                const attachMessage = {
                                    text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 1 lớp 10 ôn thi THPTQG. Phụ huynh nhấn vào lớp bên dưới để tìm hiểu thông tin cụ thể ạ.`,
                                    attachment: {
                                        type: 'template',
                                        payload: {
                                            buttons: [
                                                {
                                                    title: 'Lớp 10A1 nâng cao',
                                                    payload: '#tt2007A1',
                                                    type: 'oa.query.show',
                                                },
                                            ],
                                        },
                                    },
                                };

                                await ZaloAPI.sendMessageWithButton(
                                    accessToken,
                                    zaloUserId,
                                    attachMessage
                                );

                                res.send('Done!');

                                break;
                            }

                            case isK11: {
                                const attachMessage = {
                                    text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 11 ôn thi THPTQG, xếp lớp dựa trên bài thi đánh giá đầu vào.\n\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                                    attachment: {
                                        type: 'template',
                                        payload: {
                                            buttons: [
                                                {
                                                    title: 'Lớp 11A0 vận dụng cao',
                                                    payload: '#tt2006A0',
                                                    type: 'oa.query.show',
                                                },
                                                {
                                                    title: 'Lớp 11A1 nâng cao',
                                                    payload: '#tt2006A1',
                                                    type: 'oa.query.show',
                                                },
                                            ],
                                        },
                                    },
                                };

                                await ZaloAPI.sendMessageWithButton(
                                    accessToken,
                                    zaloUserId,
                                    attachMessage
                                );

                                res.send('Done!');

                                break;
                            }

                            case isK12: {
                                const attachMessage = {
                                    text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 12 ôn thi THPTQG, xếp lớp dựa trên bài thi đánh giá đầu vào.\n\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                                    attachment: {
                                        type: 'template',
                                        payload: {
                                            buttons: [
                                                {
                                                    title: 'Lớp 12A0 vận dụng cao',
                                                    payload: '#tt2005A0',
                                                    type: 'oa.query.show',
                                                },
                                                {
                                                    title: 'Lớp 12A1 nâng cao',
                                                    payload: '#tt2005A1',
                                                    type: 'oa.query.show',
                                                },
                                            ],
                                        },
                                    },
                                };

                                await ZaloAPI.sendMessageWithButton(
                                    accessToken,
                                    zaloUserId,
                                    attachMessage
                                );

                                res.send('Done!');

                                break;
                            }

                            case isTTL: {
                                // #TT2007A0
                                const classId = content.slice(-6).toUpperCase();

                                await Tools.sendPublicClassInfo(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    classInfoColl,
                                    classId
                                );

                                break;
                            }

                            case isLDH:
                                await Tools.sendClassInfo(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    classInfoColl,
                                    zaloColl
                                );

                                res.send('Done!');

                                break;

                            case isHPHT:
                                await Tools.sendPaymentInfo(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    zaloColl,
                                    classInfoColl,
                                    studentInfoColl
                                );

                                break;

                            case isTTCK:
                                await Tools.sendPaymentTypeInfo(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    zaloColl,
                                    classInfoColl,
                                    studentInfoColl
                                );

                                break;

                            case isCPCK:
                                await Tools.sendSyntaxPayment(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    zaloColl,
                                    classInfoColl
                                );

                                break;

                            case isDDHT:
                                await Tools.sendAttendanceInfo(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    zaloColl,
                                    classInfoColl,
                                    studentInfoColl
                                );

                                break;

                            case isLHTG:
                                await Tools.sendAssistantInfo(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    zaloColl,
                                    classInfoColl
                                );
                                break;

                            case isCheckDKPH: {
                                const classId = content.slice(5).toUpperCase();
                                const syntax = formatContent.slice(0, 5);

                                await Tools.checkRegister(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    classInfoColl,
                                    zaloColl,
                                    classColl,
                                    classId,
                                    syntax
                                );

                                break;
                            }

                            case isCheckCDKPH: {
                                const classId = content.slice(6).toUpperCase();
                                const syntax = formatContent.slice(0, 6);

                                await Tools.checkRegister(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    classInfoColl,
                                    zaloColl,
                                    classColl,
                                    classId,
                                    syntax
                                );

                                break;
                            }

                            case isCheckDKHS: {
                                const classId = content.slice(5).toUpperCase();
                                const syntax = formatContent.slice(0, 5);

                                await Tools.checkRegister(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    classInfoColl,
                                    zaloColl,
                                    classColl,
                                    classId,
                                    syntax
                                );

                                break;
                            }

                            case isCheckCDKHS: {
                                const classId = content.slice(6).toUpperCase();
                                const syntax = formatContent.slice(0, 6);

                                await Tools.checkRegister(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    classInfoColl,
                                    zaloColl,
                                    classColl,
                                    classId,
                                    syntax
                                );

                                break;
                            }

                            case isCNH: {
                                const classId = formatContent
                                    .slice(4)
                                    .toUpperCase();

                                await Tools.sendStudentNotPayment(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    classId,
                                    studentInfoColl,
                                    classInfoColl
                                );
                                break;
                            }

                            case isCNHPH: {
                                const classId = formatContent
                                    .slice(6)
                                    .toUpperCase();

                                await Tools.alarmStudentNotPayment2Parent(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    classId,
                                    zaloColl,
                                    studentInfoColl,
                                    classInfoColl
                                );

                                break;
                            }

                            case isExCludeCNHPH: {
                                const classId = formatContent
                                    .slice(6, 12)
                                    .toUpperCase();

                                const excludeStudentLists = formatContent
                                    .slice(13)
                                    .split(',');

                                await Tools.alarmStudentNotPayment2Parent(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    classId,
                                    zaloColl,
                                    studentInfoColl,
                                    classInfoColl,
                                    'excludeStudent',
                                    excludeStudentLists
                                );

                                break;
                            }

                            case isIncludeCNHPH: {
                                const classId = formatContent
                                    .slice(6, 12)
                                    .toUpperCase();

                                const onlyStudentLists = formatContent
                                    .slice(13)
                                    .split(',');

                                await Tools.alarmStudentNotPayment2Parent(
                                    res,
                                    accessToken,
                                    zaloUserId,
                                    classId,
                                    zaloColl,
                                    studentInfoColl,
                                    classInfoColl,
                                    'onlyStudent',
                                    onlyStudentLists
                                );

                                break;
                            }
                        }
                    }
                }

                // Neu chua follow OA
                else {
                    const failContent = `PHHS vui lòng nhấn Quan tâm OA để được hỗ trợ nhanh chóng và sử dụng đầy đủ những tính năng của lớp toán.`;

                    await ZaloAPI.sendMessage(
                        accessToken,
                        zaloUserId,
                        failContent
                    );

                    await ZaloAPI.tagFollower(
                        accessToken,
                        zaloUserId,
                        'Chưa quan tâm'
                    );

                    res.send('Done!');
                    return;
                }

                break;

            // eventName = 'user_send_link', 'user_send_audio', 'user_send_video',  'user_send_file'
            default:
                zaloUserId = webhook.sender.id;

                // Check xem nguoi dung da follow OA chua
                const isFollow = await Tools.isFollow(zaloUserId, zaloColl);

                if (isFollow) {
                    // Neu tu phia phu huynh thi phan hoi lai tin nhan hinh anh cho tro giang
                    const isParent = !(await Tools.isManagerCheck(
                        zaloUserId,
                        classInfoColl
                    ));
                    if (isParent) {
                        const mediaInfo = webhook.message;

                        await Tools.forwardOtherMedia2Assistant(
                            res,
                            accessToken,
                            zaloUserId,
                            zaloColl,
                            classInfoColl,
                            mediaInfo
                        );
                    }
                } else {
                    await ZaloAPI.tagFollower(
                        accessToken,
                        zaloUserId,
                        'Chưa quan tâm'
                    );
                }

                res.send('Done!');
        }
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const tokenRequest = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');

        const { refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

        await MongoDB.updateTokenInDB(tokenColl, refreshToken);

        res.send('Done');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const updateRequest = async (req, res) => {
    const webhook = req.body;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const studentInfoColl = db.collection('studentInfo');

        const updateStudentDocs = webhook.map((v) => {
            const {
                index, // vi tri hoc sinh
                studentId,
                classId,
                studentName,
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
            } = v;

            const newAttendances = attendances.map((v) => {
                const { no, date, teacher } = v;

                const newDate = Tools.createDate(date);

                return { no, newDate, teacher };
            });

            const newAbsences = absences.map((v) => {
                const { no, date, teacher } = v;

                const newDate = Tools.createDate(date);

                return { no, newDate, teacher };
            });

            const updateDoc = {
                studentId: studentId,
                classId: classId,
                studentName: studentName,
                terms: [
                    {
                        index: index,
                        term: parseInt(term),
                        start: Tools.createDate(start),
                        end: Tools.createDate(end),
                        total: total,
                        study: study,
                        absent: absent,
                        subject: subject,
                        remainderBefore: remainderBefore,
                        billing: billing,
                        payment: payment,
                        type: type,
                        paidDate: paidDate,
                        remainder: remainder,
                        attendances: newAttendances,
                        absences: newAbsences,
                    },
                ],
            };

            return updateDoc;
        });

        const classId = updateStudentDocs[0].classId;
        const term = updateStudentDocs[0].terms[0].term;

        // tim kiem tat ca du lieu lop x dot y
        const cursor = studentInfoColl.find(
            { classId: classId, 'terms.term': parseInt(term) },
            { projection: { _id: 0, studentId: 1 } }
        );

        const studentTermData = (await cursor.toArray()).map((v) => {
            return v.studentId;
        });

        let bulkWriteStudentInfo = [];

        for (let i = 0; i < updateStudentDocs.length; i++) {
            const doc = updateStudentDocs[i];
            const { studentId } = doc;

            // Neu da ton tai dot tuong ung thi update
            if (studentTermData.includes(studentId)) {
                bulkWriteStudentInfo.push({
                    updateOne: {
                        filter: {
                            studentId: studentId,
                            'terms.term': parseInt(term),
                        },
                        update: { $set: { 'terms.$': doc.terms[0] } }, // cap nhat dot dau tien
                    },
                });
            }
            // Neu chua thi kiem tra da co dot nao chua
            else {
                const isExistTerm = await MongoDB.findOneUser(
                    studentInfoColl,
                    { studentId: studentId },
                    { _id: 0, terms: 1 }
                );

                // Neu chua co dot nao, tao du lieu tu dau
                if (isExistTerm === null) {
                    bulkWriteStudentInfo.push({ insertOne: { document: doc } });
                }
                // Neu da co du lieu dot cu, day them vao
                else {
                    bulkWriteStudentInfo.push({
                        updateOne: {
                            filter: { studentId: studentId },
                            update: { $push: { terms: doc.terms[0] } }, // chi push dot dau tien
                        },
                    });
                }
            }
        }

        const result = await studentInfoColl.bulkWrite(bulkWriteStudentInfo);

        res.send('Done');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
