import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';

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

                if (await Tools.isFollow(zaloUserId, zaloColl)) {
                    ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');
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
                    const profileDoc = await ZaloAPI.getProfile(accessToken, zaloUserId);

                    await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');

                    await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');

                    MongoDB.insertOneUser(zaloColl, profileDoc);
                }

                // Nguoi dung quan tam tro lai
                else {
                    MongoDB.updateOneUser(zaloColl, { zaloUserId: `${zaloUserId}` }, { $set: { status: 'follow' } });

                    if (isExistInZaloColl.userPhone === null) {
                        await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');
                        await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');
                    } else {
                        await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');
                    }
                }

                break;

            case 'unfollow':
                zaloUserId = webhook.follower.id;

                await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa đăng kí');

                await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');

                MongoDB.updateOneUser(zaloColl, { zaloUserId: `${zaloUserId}` }, { $set: { status: 'unfollow' } });

                break;

            case 'user_reacted_message':
                zaloUserId = webhook.sender.id;

                // Check xem tha tym den OA co tu phia Tro giang khong
                const isAssistant = await Tools.isManagerCheck(zaloUserId, classInfoColl);

                // Neu tu phia tro giang thi chuyen tiep tym lai cho phu huynh
                if (isAssistant) {
                    const reactMessageId = webhook.message.msg_id;

                    const reactIcon = webhook.message.react_icon;

                    await Tools.sendReactBack2Parent(accessToken, zaloUserId, reactMessageId, reactIcon, zaloColl);
                }

                break;

            case 'user_send_image':
                zaloUserId = webhook.sender.id;

                const imageInfo = webhook.message;

                // Check xem nguoi dung da follow OA chua
                const isFollowImage = await Tools.isFollow(zaloUserId, zaloColl);

                // Neu da follow
                if (isFollowImage) {
                    const isManager = await Tools.isManagerCheck(zaloUserId, classInfoColl);

                    // Neu tu phia tro giang thi phan hoi lai tin nhan hinh anh cho phu huynh
                    if (isManager) {
                        await Tools.sendImageBack2Parent(accessToken, imageInfo, zaloColl);
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
                    }
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
                        const isManager = await Tools.isManagerCheck(zaloUserId, classInfoColl);

                        // Neu tu phia tro giang thi phan hoi lai cho phu huynh
                        if (isManager) {
                            const quoteMessageId = webhook.message.quote_msg_id || null;

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
                    } else if (isSyntax) {
                        /*  Cac tinh nang tra cuu */

                        const isDKTK = formatContent === '#dktk';
                        const isVTDK = formatContent === '#vtdk';
                        const isDKPH = formatContent === '#dkph';
                        const isDKHS = formatContent === '#dkhs';
                        const isDC = formatContent === '#dc';
                        const isLDH = formatContent === '#ldh';
                        const isHPHT = formatContent === '#hpht';
                        const isTTCK = formatContent === '#ttck';
                        const isCPCK = formatContent === '#cpck';
                        const isDDHT = formatContent === '#ddht';
                        const isLHTG = formatContent === '#lhtg';

                        switch (true) {
                            case isDKTK:
                                await Tools.signUpAlert(res, accessToken, zaloUserId, zaloColl);
                                break;

                            case isVTDK:
                                await Tools.signUpRole(res, accessToken, zaloUserId);
                                break;

                            case isDKPH:
                                await Tools.signUp4Parent(res, accessToken, zaloUserId);
                                break;

                            case isDKHS:
                                await Tools.signUp4Student(res, accessToken, zaloUserId);
                                break;

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

                                await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

                                break;
                            }

                            case isLDH:
                                await Tools.sendClassInfo(res, accessToken, zaloUserId, classInfoColl, zaloColl);

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
                                await Tools.sendSyntaxPayment(res, accessToken, zaloUserId, zaloColl, classInfoColl);

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
                                await Tools.sendAssistantInfo(res, accessToken, zaloUserId, zaloColl, classInfoColl);
                                break;
                        }
                    }
                }

                // Neu chua follow OA
                else {
                    const failContent = `PHHS vui lòng nhấn Quan tâm OA để được hỗ trợ nhanh chóng và sử dụng đầy đủ những tính năng của lớp toán.`;

                    await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                    await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');
                }

                break;

            default:
                break;
        }

        res.send('Done!');
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
                        check: '',
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

        const { classId, term } = webhook[0];

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

            // Neu da ton tai hoc sinh voi dot tuong ung thi update
            if (studentTermData.includes(studentId)) {
                bulkWriteStudentInfo.push({
                    updateOne: {
                        filter: {
                            studentId: studentId,
                            'terms.term': parseInt(term),
                        },
                        update: { $set: { 'terms.$': doc.terms[0] } },
                    },
                });
            }
            // Neu chua thi kiem tra hoc sinh da co dot nao chua
            else {
                const isExistTerm = await MongoDB.findOneUser(
                    studentInfoColl,
                    { studentId: studentId },
                    { _id: 0, terms: 1 }
                );

                // Neu chua co dot nao, tao du lieu hoc sinh tu dau
                if (isExistTerm === null) {
                    bulkWriteStudentInfo.push({ insertOne: { document: doc } });
                }
                // Neu da co du lieu hoc sinh dot cu, day them du lieu dot moi vao
                else {
                    bulkWriteStudentInfo.push({
                        updateOne: {
                            filter: { studentId: studentId },
                            update: { $push: { terms: doc.terms[0] } },
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

export const invoiceRequest = async (req, res) => {
    const webhook = req.body;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const studentInfoColl = db.collection('studentInfo');
        const tokenColl = db.collection('tokens');
        const classInfoColl = db.collection('classInfo');
        const zaloColl = db.collection('zaloUsers');
        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        for (let i = 0; i < webhook.length; i++) {
            const doc = webhook[i];
            const { studentId, classId, term, payment } = doc;

            // Fetch current data for this student and term
            const currentData = await studentInfoColl.findOne(
                {
                    studentId: studentId,
                    'terms.term': parseInt(term),
                },
                { projection: { _id: 0, 'terms.$': 1 } }
            );

            // If there is a difference in the 'payment' value between the current data and the incoming webhook
            if (currentData && currentData.terms[0].check !== payment) {
                const existClass = await MongoDB.findOneUser(
                    classInfoColl,
                    { classId: classId },
                    { projection: { _id: 0, className: 1 } }
                );

                if (existClass === null) {
                    console.log('Class not exist');
                    break;
                }

                const invoice = createInvoice(doc, existClass.className);

                const zaloUserIdArr = await Tools.findZaloUserIdFromStudentId(zaloColl, studentId);

                for (let i = 0; i < zaloUserIdArr.length; i++) {
                    const { zaloUserId } = zaloUserIdArr[i];

                    await ZaloAPI.sendInvoice(accessToken, zaloUserId, invoice);
                }

                // Update the 'check' value in the database
                await studentInfoColl.updateOne(
                    {
                        studentId: studentId,
                        'terms.term': parseInt(term),
                    },
                    {
                        $set: {
                            'terms.$.check': payment,
                        },
                    }
                );
            }
        }

        res.send('Done');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

const createInvoice = (doc, className) => {
    const { studentId, studentName, term, remainderBefore, billing, payment, paidDate } = doc;

    const remainder = remainderBefore + billing - payment;
    const remainderValue = Tools.formatCurrency(remainder);
    let statusKey, statusValue, statusStyle;
    if (remainder === 0) {
        statusKey = 'Nộp đủ';
        statusValue = '';
        statusStyle = 'green';
    } else if (remainder < 0) {
        statusKey = 'Nộp thiếu';
        statusValue = remainderValue;
        statusStyle = 'red';
    } else {
        statusKey = 'Nộp dư';
        statusValue = remainderValue;
        statusStyle = 'yellow';
    }

    const invoice = {
        attachment: {
            type: 'template',
            payload: {
                template_type: 'transaction_billing',
                language: 'VI',
                elements: [
                    {
                        image_url:
                            'https://img.freepik.com/free-vector/happy-students-learning-math-college-school-isolated-flat-illustration_74855-10799.jpg?w=900&t=st=1687578435~exp=1687579035~hmac=c2bab6af873f00a495540dde952a0e7dd9331bbf4c6a6db67b5150eb86c5e81f',
                        type: 'banner',
                    },
                    {
                        type: 'header',
                        content: 'Xác nhận thanh toán học phí con',
                        align: 'center',
                    },
                    {
                        type: 'text',
                        align: 'center',
                        content: `${studentName}`,
                    },
                    {
                        type: 'table',
                        content: [
                            {
                                value: studentId,
                                key: 'Mã học sinh',
                            },
                            {
                                value: `${className} - D${term}`,
                                key: 'Đợt',
                            },
                            {
                                value: paidDate,
                                key: 'Ngày nộp',
                            },
                            {
                                value: Tools.formatCurrency(billing),
                                key: 'Học phí',
                            },
                            {
                                value: Tools.formatCurrency(remainderBefore),
                                key: remainderBefore < 0 ? 'Nợ cũ' : 'Dư cũ',
                            },
                            {
                                value: Tools.formatCurrency(payment),
                                key: 'Đã nộp',
                            },
                            {
                                style: statusStyle,
                                value: `${statusKey} ${statusValue}`,
                                key: 'Trạng thái',
                            },
                        ],
                    },
                    {
                        type: 'text',
                        align: 'center',
                        content:
                            'Cảm ơn quý phụ huynh đã luôn tin tưởng và lựa chọn trung tâm toán Câu lạc bộ Ánh Sáng!',
                    },
                ],
                buttons: [],
            },
        },
    };

    return invoice;
};
