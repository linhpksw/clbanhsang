import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';

export const userRequest = async (req, res) => {
    const webhook = req.body;

    const eventName = webhook.event_name;

    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');
        const classInfoColl = db.collection('classInfo');
        const studentInfoColl = db.collection('studentInfo');

        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        let zaloUserId, messageId;

        switch (eventName) {
            case 'user_click_chatnow':
                zaloUserId = webhook.user_id;

                if (await Tools.isFollow(zaloUserId, accessToken)) {
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
                console.log('isExistInZaloColl: ', isExistInZaloColl);

                // Neu nguoi dung quan tam lan dau
                if (isExistInZaloColl === null) {
                    console.log('new user follow');

                    const profileDoc = await ZaloAPI.getProfile(accessToken, zaloUserId);
                    console.log(profileDoc);

                    await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');

                    await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');

                    MongoDB.insertOneUser(zaloColl, profileDoc);
                }

                // Nguoi dung quan tam tro lai
                else {
                    console.log('user follow back');

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
                console.log('process unfollow');
                zaloUserId = webhook.follower.id;

                await Tools.sendUnfollow2Assistant(accessToken, zaloUserId, zaloColl, classInfoColl);

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
                messageId = webhook.message.msg_id;

                const imageInfo = webhook.message;

                // Check xem nguoi dung da follow OA chua
                const isFollowImage = await Tools.isFollow(zaloUserId, accessToken);

                // Neu da follow
                if (isFollowImage) {
                    const isManager = await Tools.isManagerCheck(zaloUserId, classInfoColl);

                    // Neu tu phia tro giang thi phan hoi lai tin nhan hinh anh cho phu huynh
                    if (isManager) {
                        await Tools.sendImageBack2Parent(accessToken, imageInfo, zaloColl);
                    }

                    // Neu tu phia phu huynh thi phan hoi lai tin nhan hinh anh cho tro giang
                    else {
                        const thankYouMessage = `Trung tâm cảm ơn bác ạ!`;

                        await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'heart');

                        await ZaloAPI.sendMessage(accessToken, zaloUserId, thankYouMessage);

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
                messageId = webhook.message.msg_id;
                const content = webhook.message.text;

                let formatContent = Tools.nomarlizeSyntax(content);

                const isFollowOA = await Tools.isFollow(zaloUserId, accessToken);

                if (isFollowOA) {
                    // Kiem tra cu phap co phai tra cuu khong
                    const isSyntax = formatContent.includes('#');

                    const isDKPH = formatContent.slice(0, 4) === 'dkph';
                    const isDKHS = formatContent.slice(0, 4) === 'dkhs';
                    const isXPH = formatContent.slice(0, 3) === 'xph';
                    const isXHS = formatContent.slice(0, 3) === 'xhs';
                    const isDKTG = formatContent.slice(0, 4) === 'dktg';

                    if (isDKPH) {
                        // dang ki cho phu huynh OA
                        // syntax: dkhph 2009001 0915806944
                        // dang ki ho cho phu huynh OA
                        // syntax: dkph 2009001 0915806944 2203179121235804730

                        // Check xem tin nhan den OA co tu phia Tro giang khong
                        const isManager = await Tools.isManagerCheck(zaloUserId, classInfoColl);

                        // Neu tu phia tro giang thi thay doi syntax
                        if (isManager) {
                            const extractZaloUserId = formatContent.slice(21);
                            const extractFormatContent = formatContent.slice(0, 21);

                            const response = await Tools.signUp(
                                accessToken,
                                extractZaloUserId,
                                zaloColl,
                                classColl,
                                classInfoColl,
                                extractFormatContent,
                                messageId,
                                'Phụ huynh'
                            );

                            ZaloAPI.sendMessage(accessToken, zaloUserId, response);
                        } else {
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
                        }
                    } else if (isDKHS) {
                        // Check xem tin nhan den OA co tu phia Tro giang khong
                        const isManager = await Tools.isManagerCheck(zaloUserId, classInfoColl);

                        // Neu tu phia tro giang thi thay doi syntax
                        if (isManager) {
                            const extractZaloUserId = formatContent.slice(21);
                            const extractFormatContent = formatContent.slice(0, 21);

                            const response = await Tools.signUp(
                                accessToken,
                                extractZaloUserId,
                                zaloColl,
                                classColl,
                                classInfoColl,
                                extractFormatContent,
                                messageId,
                                'Học sinh'
                            );

                            ZaloAPI.sendMessage(accessToken, zaloUserId, response);
                        } else {
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
                        }
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
                        const isDSHT = formatContent === '#dsht';

                        switch (true) {
                            case isDKTK:
                                await Tools.signUpAlert(accessToken, zaloUserId, zaloColl);
                                break;

                            case isVTDK:
                                await Tools.signUpRole(accessToken, zaloUserId);
                                break;

                            case isDKPH:
                                await Tools.signUp4Parent(accessToken, zaloUserId);
                                break;

                            case isDKHS:
                                await Tools.signUp4Student(accessToken, zaloUserId);
                                break;

                            case isDC: {
                                const attachMessage = {
                                    text: `Trung tâm toán Câu lạc bộ Ánh Sáng có địa chỉ tại trường THPT Lê Hồng Phong, số 27 Tô Hiệu, P.Nguyễn Trãi, Hà Đông.`,
                                    attachment: {
                                        type: 'template',
                                        payload: {
                                            buttons: [
                                                {
                                                    title: 'Xem cụ thể trên bản đồ',
                                                    payload: {
                                                        url: 'https://maps.app.goo.gl/jugZtSFAoQi7sBfV6',
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
                                await Tools.sendClassInfo(accessToken, zaloUserId, classInfoColl, zaloColl);

                                break;

                            case isHPHT:
                                await Tools.sendPaymentInfo(
                                    accessToken,
                                    zaloUserId,
                                    zaloColl,
                                    classInfoColl,
                                    studentInfoColl
                                );

                                break;

                            case isDSHT:
                                // await Tools.sendScoreInfo(accessToken, zaloUserId, zaloColl, scoreInfoColl);
                                break;

                            case isTTCK:
                                await Tools.sendPaymentTypeInfo(
                                    accessToken,
                                    zaloUserId,
                                    zaloColl,
                                    classInfoColl,
                                    studentInfoColl
                                );

                                break;

                            case isCPCK:
                                await Tools.sendSyntaxPayment(accessToken, zaloUserId, zaloColl, classInfoColl);

                                break;

                            case isDDHT:
                                await Tools.sendAttendanceInfo(
                                    accessToken,
                                    zaloUserId,
                                    zaloColl,
                                    classInfoColl,
                                    studentInfoColl
                                );

                                break;

                            case isLHTG:
                                await Tools.sendAssistantInfo(accessToken, zaloUserId, zaloColl, classInfoColl);
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

        const bulkWriteOperations = await Promise.all(
            updateStudentDocs.map(async (doc) => {
                const { studentId, terms } = doc;

                const existingStudent = await studentInfoColl.findOne({ studentId: studentId });

                if (!existingStudent) {
                    // Case 1: Student does not exist, so insert the student along with the term details
                    doc.terms[0].check = '';
                    return { insertOne: { document: doc } };
                } else if (existingStudent && !existingStudent.terms.some((t) => t.term === terms[0].term)) {
                    // Case 2: Student exists but term does not, so push the new term
                    doc.terms[0].check = '';
                    return {
                        updateOne: {
                            filter: { studentId: studentId },
                            update: { $push: { terms: terms[0] } },
                        },
                    };
                } else {
                    // Case 3: Both student and term exist, so update the term details
                    return {
                        updateOne: {
                            filter: { studentId: studentId, 'terms.term': terms[0].term },
                            update: {
                                $set: {
                                    'terms.$.start': terms[0].start,
                                    'terms.$.end': terms[0].end,
                                    'terms.$.total': terms[0].total,
                                    'terms.$.study': terms[0].study,
                                    'terms.$.absent': terms[0].absent,
                                    'terms.$.subject': terms[0].subject,
                                    'terms.$.remainderBefore': terms[0].remainderBefore,
                                    'terms.$.billing': terms[0].billing,
                                    'terms.$.payment': terms[0].payment,
                                    'terms.$.type': terms[0].type,
                                    'terms.$.paidDate': terms[0].paidDate,
                                    'terms.$.remainder': terms[0].remainder,
                                    'terms.$.attendances': terms[0].attendances,
                                    'terms.$.absences': terms[0].absences,
                                },
                            },
                        },
                    };
                }
            })
        );

        await studentInfoColl.bulkWrite(bulkWriteOperations);

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

        const imageId = await ZaloAPI.uploadImage(accessToken, './img/invoice.jpg');

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
            if (currentData && currentData.terms[0].check !== payment && payment > 0) {
                const existClass = await MongoDB.findOneUser(
                    classInfoColl,
                    { classId: classId },
                    { projection: { _id: 0, className: 1 } }
                );

                if (existClass === null) {
                    console.log('Class not exist');
                    break;
                }

                const invoice = createInvoice(doc, existClass.className, imageId);

                const pipeline = [
                    {
                        $match: {
                            'students.zaloStudentId': parseInt(studentId),
                        },
                    },
                    {
                        $project: {
                            zaloUserId: 1,
                            displayName: 1,
                            userPhone: 1,
                            _id: 0,
                            students: {
                                $filter: {
                                    input: '$students',
                                    as: 'item',
                                    cond: {
                                        $eq: ['$$item.zaloStudentId', parseInt(studentId)],
                                    },
                                },
                            },
                        },
                    },
                ];

                const aggCursor = zaloColl.aggregate(pipeline);

                const zaloUserIdArr = await aggCursor.toArray();

                if (zaloUserIdArr.length === 0) {
                    console.log('Zalo user is not exist');
                    continue;
                }

                for (let i = 0; i < zaloUserIdArr.length; i++) {
                    const { zaloUserId, students } = zaloUserIdArr[i];

                    // chi gui bien lai den phu huynh
                    if (students[0].role === 'Phụ huynh') {
                        // console.log('send invoice to', students[0].aliasName);
                        await ZaloAPI.sendInvoice(accessToken, zaloUserId, invoice);

                        //  Update the 'check' value in the database
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
            }
        }

        res.send('Done');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

const createInvoice = (doc, className, imageId) => {
    const { studentId, studentName, term, remainderBefore, billing, payment, paidDate } = doc;

    const billingValue = isNaN(billing) ? billing : Tools.formatCurrency(billing);

    let remainder;
    if (isNaN(billing)) {
        if (billing === 'Đã nộp đủ') {
            remainder = payment;
        } else if (billing.includes('Thừa')) {
            const billingNum = parseInt(billing.replace(/\D/g, ''));
            remainder = payment + billingNum;
        }
    } else {
        remainder = payment - billing;
    }

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
    } else if (remainder > 0) {
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
                        image_url: imageId,
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
                                value: Tools.formatCurrency(remainderBefore),
                                key: remainderBefore < 0 ? 'Nợ cũ' : 'Dư cũ',
                            },
                            {
                                value: billingValue,
                                key: 'Phải nộp',
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
                            'Cảm ơn quý phụ huynh đã luôn tin tưởng và lựa chọn Trung tâm Toán Câu lạc bộ Ánh Sáng!',
                    },
                ],
                buttons: [],
            },
        },
    };

    return invoice;
};
