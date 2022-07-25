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

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

        let zaloUserId;

        if (eventName === 'user_click_chatnow') {
            zaloUserId = webhook.user_id;

            if (!(await Tools.isFollow(zaloUserId, zaloColl))) {
                ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');
            }
        } else if (eventName === 'follow') {
            zaloUserId = webhook.follower.id;

            const isExistInZaloColl = await MongoDB.findOneUser(
                zaloColl,
                { zaloUserId: `${zaloUserId}` },
                { projection: { _id: 0, userPhone: 1 } }
            );

            if (isExistInZaloColl === null) {
                const profileDoc = await ZaloAPI.getProfile(accessToken, zaloUserId);
                console.log(`${profileDoc.displayName} quan tâm OA (${profileDoc.zaloUserId})`);

                await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');
                await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');

                MongoDB.insertOneUser(zaloColl, profileDoc);
            } else {
                MongoDB.updateOneUser(
                    zaloColl,
                    { zaloUserId: `${zaloUserId}` },
                    { $set: { status: 'follow' } }
                );

                if (isExistInZaloColl.userPhone === null) {
                    await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');
                    await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');
                } else {
                    await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');
                }

                console.log('Nguời dùng quan tâm trở lại');
            }

            res.send('Done!');
        } else if (eventName === 'unfollow') {
            zaloUserId = webhook.follower.id;

            await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa đăng kí');
            await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');

            MongoDB.updateOneUser(
                zaloColl,
                { zaloUserId: `${zaloUserId}` },
                { $set: { status: 'unfollow' } }
            );
            console.log('Người dùng bỏ quan tâm OA');
        } else if (eventName === 'user_reacted_message') {
            // Check xem tha tym den OA co tu phia Tro giang khong
            zaloUserId = webhook.sender.id;

            if (!(await Tools.isManager(zaloUserId, classInfoColl))) {
                res.send('Done!');
                return;
            } else {
                // Neu tu phia tro giang thi chuyen tiep tym lai cho phu huynh
                const reactMessageId = webhook.message.msg_id;

                const reactIcon = webhook.message.react_icon;

                await Tools.sendReactBack2Parent(
                    accessToken,
                    zaloUserId,
                    reactMessageId,
                    reactIcon,
                    zaloColl
                );

                res.send('Done!');
                return;
            }
        }
        // Nguoi dung gui tin nhan link, audio, video, sticker, ...
        else if (
            eventName === 'user_send_link' ||
            eventName === 'user_send_audio' ||
            eventName === 'user_send_video' ||
            eventName === 'user_send_file'
        ) {
            zaloUserId = webhook.sender.id;

            // Check xem nguoi dung da follow OA chua
            if (!(await Tools.isFollow(zaloUserId, zaloColl))) {
                // const failContent = `PHHS vui lòng nhấn Quan tâm OA để được hỗ trợ nhanh chóng và sử dụng đầy đủ những tính năng của lớp toán.`;

                // await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');

                res.send('Done!');
                return;
            }

            // Neu tu phia phu huynh thi phan hoi lai tin nhan hinh anh cho tro giang
            if (!(await Tools.isManager(zaloUserId, classInfoColl))) {
                const mediaInfo = webhook.message;

                await Tools.forwardOtherMedia2Assistant(
                    res,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classInfoColl,
                    mediaInfo,
                    localeTimeStamp
                );
            }
        }
        // Mguoi dung gui tin nhan hinh anh
        else if (eventName === 'user_send_image') {
            zaloUserId = webhook.sender.id;
            const imageInfo = webhook.message;

            // Check xem nguoi dung da follow OA chua
            if (!(await Tools.isFollow(zaloUserId, zaloColl))) {
                // const failContent = `PHHS vui lòng nhấn Quan tâm OA để được hỗ trợ nhanh chóng và sử dụng đầy đủ những tính năng của lớp toán.`;

                // await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');

                res.send('Done!');
                return;
            }

            // Check xem tin nhan hinh anh den OA co tu phia Tro giang khong
            // Neu tu phia phu huynh thi phan hoi lai tin nhan hinh anh cho tro giang
            if (!(await Tools.isManager(zaloUserId, classInfoColl))) {
                await Tools.forwardImage2Assistant(
                    res,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classInfoColl,
                    imageInfo,
                    localeTimeStamp
                );

                const mediaInfo = webhook.message;

                await Tools.forwardOtherMedia2Assistant(
                    res,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classInfoColl,
                    mediaInfo,
                    localeTimeStamp
                );
            }
            // Neu tu phia tro giang thi phan hoi lai tin nhan hinh anh cho phu huynh
            else {
                await Tools.sendImageBack2Parent(res, accessToken, imageInfo, zaloColl);
            }
        }
        // Nguoi dung gui tin nhan text
        else if (eventName === 'user_send_text') {
            zaloUserId = webhook.sender.id;

            const messageId = webhook.message.msg_id;
            const content = webhook.message.text;

            const formatContent = Tools.nomarlizeSyntax(content);

            // Check xem nguoi dung da follow OA chua
            if (!(await Tools.isFollow(zaloUserId, zaloColl))) {
                const failContent = `PHHS vui lòng nhấn Quan tâm OA để được hỗ trợ nhanh chóng và sử dụng đầy đủ những tính năng của lớp toán.`;

                await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');

                res.send('Done!');
                return;
            }

            if (formatContent.slice(0, 4) === 'dkph') {
                Tools.signUp(
                    res,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classColl,
                    classInfoColl,
                    formatContent,
                    messageId,
                    'Phụ huynh'
                );
            } else if (formatContent.slice(0, 4) === 'dkhs') {
                Tools.signUp(
                    res,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classColl,
                    classInfoColl,
                    formatContent,
                    messageId,
                    'Học sinh'
                );
            } else if (formatContent.slice(0, 3) === 'xph') {
                Tools.deleteAccount(
                    res,
                    formatContent,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classInfoColl,
                    messageId,
                    'Phụ huynh'
                );
            } else if (formatContent.slice(0, 3) === 'xhs') {
                Tools.deleteAccount(
                    res,
                    formatContent,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classInfoColl,
                    messageId,
                    'Học sinh'
                );
            } else if (formatContent.slice(0, 4) === 'dktg') {
                Tools.signUp4Assistant(
                    res,
                    accessToken,
                    zaloUserId,
                    classInfoColl,
                    zaloColl,
                    content,
                    messageId
                );
            }

            // Meu cu phap khong phai tra cuu
            else if (!formatContent.includes('#')) {
                // Check xem tin nhan den OA co tu phia Tro giang khong
                // Neu tu phia phu huynh thi phan hoi lai cho tro giang
                if (!(await Tools.isManager(zaloUserId, classInfoColl))) {
                    await Tools.forwardMessage2Assistant(
                        res,
                        accessToken,
                        zaloUserId,
                        messageId,
                        zaloColl,
                        classInfoColl,
                        content,
                        localeTimeStamp
                    );
                }
                // Neu tu phia tro giang thi phan hoi lai cho phu huynh
                else {
                    const quoteMessageId = webhook.message.quote_msg_id || null;

                    if (quoteMessageId !== null) {
                        const replyContent = webhook.message.text;

                        await Tools.sendMessageBack2Parent(
                            res,
                            accessToken,
                            zaloUserId,
                            replyContent,
                            quoteMessageId,
                            zaloColl
                        );
                    } else {
                        res.send('Done!');
                        return;
                    }
                }
            }

            // Neu cu phap la tra cuu
            else if (formatContent.includes('#')) {
                /*  Cac tinh nang tra cuu */
                // 1a Dang ki tai khoan
                if (formatContent === '#dktk') {
                    await Tools.signUpAlert(res, accessToken, zaloUserId, zaloColl);
                }

                // 1b Vai tro dang ki
                else if (formatContent === '#vtdk') {
                    await Tools.signUpRole(res, accessToken, zaloUserId);
                }

                // 1c Dang ki cho phu huynh
                else if (formatContent === '#dkph') {
                    await Tools.signUp4Parent(res, accessToken, zaloUserId);
                }

                // 1d Dang ki cho hoc sinh
                else if (formatContent === '#dkhs') {
                    await Tools.signUp4Student(res, accessToken, zaloUserId);
                }

                // 1) Thong tin cac lop
                else if (formatContent === '#ttcl') {
                    const attachMessage = {
                        text: 'Hiện tại lớp toán đang tổ chức cả 2 khối THCS và THPT. Cụ thể, khối THCS ôn luyện toán từ lớp 8 đến lớp 9 còn khối THPT là từ lớp 10 đến lớp 12.\nPhụ huynh có nhu cầu đăng kí cho con khối nào ạ?',
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Tôi muốn đăng kí khối THCS',
                                        payload: '#thcs',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Tôi muốn đăng kí khối THPT',
                                        payload: '#thpt',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');

                    return;
                }

                // Dia chi hoc
                else if (formatContent === '#dc') {
                    const attachMessage = {
                        text: `Câu lạc bộ Ánh Sáng có địa chỉ tại tầng 1 trường THCS Nguyễn Trãi - Hà Đông. (Cạnh nhà thờ Hà Đông)`,
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Xem cụ thể trên bản đồ',
                                        payload: { url: 'https://goo.gl/maps/PoghpFpVtydccEYL6' },
                                        type: 'oa.open.url',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');

                    return;
                }

                // Thong tin khoi THCS
                else if (formatContent === '#thcs') {
                    const attachMessage = {
                        text: 'Phụ huynh chọn khối con muốn theo học?',
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Khối 8',
                                        payload: '#k8',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Khối 9',
                                        payload: '#k9',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');
                } else if (formatContent === '#k8') {
                    const attachMessage = {
                        text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 8 ôn thi vào chuyên toán, có kiểm tra đầu vào để xếp lớp.\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Lớp 8A0 chuyên toán',
                                        payload: '#tt2009A0',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Lớp 8A1 chuyên toán',
                                        payload: '#tt2009A1',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');

                    return;
                } else if (formatContent === '#K9') {
                    const attachMessage = {
                        text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 9 ôn thi vào chuyên toán; 1 lớp 9 nâng cao ôn toán điều kiện vào 10.\nĐối với 2 lớp 9 ôn thi chuyên, các con sẽ phải làm một bài kiểm tra đầu vào để được xếp lớp. Với lớp toán nâng cao, ôn toán điều kiện thì không cần kiểm tra xếp lớp.\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Lớp 9A0 chuyên toán + chuyên tin',
                                        payload: '#TT2008A0',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Lớp 9A1 chuyên toán + chuyên tin',
                                        payload: '#TT2008A1',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Lớp 9A2 toán điều kiện và nâng cao',
                                        payload: '#TT2008A2',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');

                    return;
                }

                // Thong tin khoi THPT
                else if (formatContent === '#thpt') {
                    const attachMessage = {
                        text: 'Phụ huynh chọn khối con muốn theo học?',
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Khối 10',
                                        payload: '#k10',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Khối 11',
                                        payload: '#k11',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Khối 12',
                                        payload: '#k12',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');
                } else if (formatContent === '#k10') {
                    const attachMessage = {
                        text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 1 lớp 10 ôn thi THPTQG. Phụ huynh nhấn vào lớp bên dưới để tìm hiểu thông tin cụ thể ạ.`,
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Lớp 10A1 nâng cao',
                                        payload: '#tt2007A1',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');

                    return;
                } else if (formatContent === '#k11') {
                    const attachMessage = {
                        text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 11 ôn thi THPTQG, xếp lớp dựa trên bài thi đánh giá đầu vào.\n\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Lớp 11A0 vận dụng cao',
                                        payload: '#tt2006A0',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Lớp 11A1 nâng cao',
                                        payload: '#tt2006A1',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');

                    return;
                } else if (formatContent === '#k12') {
                    const attachMessage = {
                        text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 12 ôn thi THPTQG, xếp lớp dựa trên bài thi đánh giá đầu vào.\n\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Lớp 12A0 vận dụng cao',
                                        payload: '#tt2005A0',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Lớp 12A1 nâng cao',
                                        payload: '#tt2005A1',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');

                    return;
                } else if (formatContent.substring(0, 5) === '#tt20' && formatContent.length === 9) {
                    // #TT2007A0
                    const classId = content.slice(-6);

                    await Tools.sendClassInfo(res, accessToken, zaloUserId, classId, classInfoColl);
                }

                // 2) Thong tin lop đang hoc
                else if (formatContent === '#ldh') {
                    await Tools.notifyRegister(res, accessToken, zaloUserId, zaloColl);

                    const { students } = await MongoDB.findOneUser(
                        zaloColl,
                        { zaloUserId: zaloUserId },
                        { projection: { _id: 0, students: 1 } }
                    );

                    for (let i = 0; i < students.length; i++) {
                        const { zaloStudentId, zaloClassId, alisaName, role } = students[i];

                        await Tools.sendClassInfo(res, accessToken, zaloUserId, zaloClassId, classInfoColl);
                    }
                }

                // 3) Hoc phi dot hien tai
                else if (formatContent === '#hpht') {
                    await Tools.sendPaymentInfo(
                        res,
                        accessToken,
                        zaloUserId,
                        zaloColl,
                        classInfoColl,
                        studentInfoColl
                    );
                }

                // 4) Thong tin chuyen khoan
                else if (formatContent === '#ttck') {
                    await Tools.sendPaymentTypeInfo(
                        res,
                        accessToken,
                        zaloUserId,
                        zaloColl,
                        classInfoColl,
                        studentInfoColl
                    );
                }

                // 5) Cu phap chuyen khoan
                else if (formatContent === '#cpck') {
                    await Tools.sendSyntaxPayment(res, accessToken, zaloUserId, zaloColl, classInfoColl);
                }

                // 6) Diem danh dot hien tai
                else if (formatContent === '#ddht') {
                    await Tools.sendAttendanceInfo(
                        res,
                        accessToken,
                        zaloUserId,
                        zaloColl,
                        classInfoColl,
                        studentInfoColl
                    );
                }

                // Lien he tro giang
                else if (formatContent === '#lhtg') {
                    await Tools.sendAssistantInfo(
                        res,
                        accessToken,
                        zaloUserId,
                        zaloColl,
                        classInfoColl,
                        studentInfoColl
                    );
                }

                // Danh cho tro giang
                else if (formatContent === '#dctg') {
                    await Tools.assistantMenu(res, accessToken, zaloUserId, classInfoColl);
                }

                // Danh sach hoc sinh da co phu huynh dang ki
                else if (formatContent.slice(0, 5) === '#dkph' && formatContent.length === 11) {
                    const classId = content.slice(5);
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
                }

                // Danh sach hoc sinh chua co phu huynh dang ki
                else if (formatContent.slice(0, 6) === '#cdkph' && formatContent.length === 12) {
                    const classId = content.slice(6);
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
                }
            }
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

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

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
                        filter: { studentId: studentId, 'terms.term': parseInt(term) },
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

        console.log(result);

        res.send('Done');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
