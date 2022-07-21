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
    const localeTimeStamp = new Date(unixTimestamp).toLocaleString('vi-VN');

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');
        const classInfoColl = db.collection('classInfo');

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

                await Tools.sendReactBack2Parent(accessToken, zaloUserId, reactMessageId, reactIcon);

                res.send('Done!');
                return;
            }
        } else if (eventName === 'user_send_text') {
            zaloUserId = webhook.sender.id;

            const messageId = webhook.message.msg_id;
            const content = webhook.message.text;

            const formatContent = Tools.nomarlizeSyntax(content);

            // Check xem nguoi dung da follow OA chua
            if (!(await Tools.isFollow(zaloUserId, zaloColl))) {
                // const failContent = `PHHS vui lòng nhấn Quan tâm OA để được hỗ trợ nhanh chóng và sử dụng đầy đủ những tính năng của lớp toán.`;

                // await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');

                res.send('Done!');
                return;
            }

            if (formatContent.includes('dkph')) {
                Tools.signUp(
                    res,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classColl,
                    formatContent,
                    messageId,
                    'Phụ huynh'
                );
            } else if (formatContent.includes('dkhs')) {
                Tools.signUp(
                    res,
                    accessToken,
                    zaloUserId,
                    zaloColl,
                    classColl,
                    formatContent,
                    messageId,
                    'Học sinh'
                );
            } else if (formatContent.includes('xph')) {
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
            } else if (formatContent.includes('xhs')) {
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
            } else if (formatContent.includes('dktg')) {
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
                    const keywords = ['DKTK', 'DC'];

                    // Kiem tra tin nhan khong nam trong Keyword moi phan hoi lai
                    if (!keywords.includes(content)) {
                        Tools.forwardMessage2Assistant(
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
                            quoteMessageId
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
                // 1) Dang ki tai khoan
                if (content === '#DK') {
                }
                // 1) Thong tin cac lop
                else if (content === '#TTCL') {
                    const attachMessage = {
                        text: 'Hiện tại lớp toán đang mở cả 2 khối THCS và THPT. Cụ thể khối THCS ôn luyện từ lớp 8 đến lớp 9 còn khối THPT là từ lớp 10 đến lớp 12.\nPhụ huynh có nhu cầu đăng kí cho con khối nào ạ?',
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Khối THCS',
                                        payload: '#THCS',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Khối THPT',
                                        payload: '#THPT',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');

                    return;
                } // Thong tin khoi THCS
                else if (content === '#THCS') {
                    const attachMessage = {
                        text: 'Phụ huynh hãy chọn khối con muốn theo học?',
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Khối 8',
                                        payload: '#K8',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Khối 9',
                                        payload: '#K9',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');
                } else if (content === '#K8') {
                    const attachMessage = {
                        text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 8 ôn thi vào chuyên toán, có kiểm tra đầu vào để xếp lớp.\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Lớp 8A0',
                                        payload: '#TT2009A0',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Lớp 8A1',
                                        payload: '#TT2009A1',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');

                    return;
                } else if (content === '#K9') {
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
                } // Thong tin khoi THPT
                else if (content === '#THPT') {
                    const attachMessage = {
                        text: 'Phụ huynh hãy chọn khối con muốn theo học?',
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Khối 10',
                                        payload: '#K10',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Khối 11',
                                        payload: '#K11',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Khối 12',
                                        payload: '#K12',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');
                } else if (content === '#K10') {
                    const attachMessage = {
                        text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 10 ôn thi THPTQG, xếp lớp dựa trên kết quả thi vào 10 của các con. \n\nLớp 10A0 vận dụng cao dành cho các học sinh đỗ chuyên toán, chuyên tin các trường chuyên; hoặc điểm thi toán điều kiện từ 9,5 trở lên. Các con được xếp vào lớp 10A1 nếu điểm thi toán điều kiện từ 8 trở lên. \n\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Lớp 10A0 vận dụng cao',
                                        payload: '#TT2007A0',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Lớp 10A1 nâng cao',
                                        payload: '#TT2007A1',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');

                    return;
                } else if (content === '#K11') {
                    const attachMessage = {
                        text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 11 ôn thi THPTQG, xếp lớp dựa trên bài thi đánh giá đầu vào.\n\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Lớp 11A0 vận dụng cao',
                                        payload: '#TT2006A0',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Lớp 11A1 nâng cao',
                                        payload: '#TT2006A1',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');

                    return;
                } else if (content === '#K12') {
                    const attachMessage = {
                        text: `Năm học 2022-2023, Câu lạc bộ Toán Ánh Sáng tổ chức 2 lớp 12 ôn thi THPTQG, xếp lớp dựa trên bài thi đánh giá đầu vào.\n\nPhụ huynh mong muốn con theo học tại lớp nào ạ?`,
                        attachment: {
                            type: 'template',
                            payload: {
                                buttons: [
                                    {
                                        title: 'Lớp 12A0 vận dụng cao',
                                        payload: '#TT2005A0',
                                        type: 'oa.query.hide',
                                    },
                                    {
                                        title: 'Lớp 12A1 nâng cao',
                                        payload: '#TT2005A1',
                                        type: 'oa.query.hide',
                                    },
                                ],
                            },
                        },
                    };

                    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                    res.send('Done!');

                    return;
                } else if (content.substring(0, 5) === '#TT20' && content.length === 9) {
                    // #TT2007A0
                    const classId = content.slice(-6);

                    await Tools.sendClassInfo(res, accessToken, zaloUserId, classId, classInfoColl);
                } // 2) Thong tin lop đang hoc
                else if (content === '#LDH') {
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
        } = webhook;

        const updateDoc = {
            studentId: studentId,
            classId: classId,
            studentName: studentName,

            terms: [
                {
                    term: parseInt(term),
                    start: start,
                    end: end,
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
                    attendances: attendances,
                    absences: absences,
                },
            ],
        };

        await MongoDB.upsertOneUser(studentInfoColl, { 'terms.term': parseInt(term) }, updateDoc);

        res.send('Done');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
