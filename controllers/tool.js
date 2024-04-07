import * as MongoDB from './mongo.js';
import * as ZaloAPI from './zalo.js';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';

function getStudyDate(startTerm, endTerm, weekday1, weekday2, absent1List, absent2List) {
    const convertWeekday = {
        'Chủ nhật': 0,
        'Thứ 2': 1,
        'Thứ 3': 2,
        'Thứ 4': 3,
        'Thứ 5': 4,
        'Thứ 6': 5,
        'Thứ 7': 6,
    };

    const date = new Date(startTerm.getTime());
    const dates = [];
    while (date <= endTerm) {
        if (date.getDay() === convertWeekday[weekday1] || date.getDay() === convertWeekday[weekday2]) {
            const formatDate = new Date(date).toLocaleDateString('vi-VN');

            dates.push(formatDate);
        }
        date.setDate(date.getDate() + 1);
    }

    const absent = `${absent1List},${absent2List}`
        .replace(/\s+/g, '')
        .split(',')
        .map((date) => {
            const [day, month, year] = date.split('/');
            return `${parseInt(day)}/${parseInt(month)}/${parseInt(year)}`;
        });

    const filteredDate = dates.filter((date) => !absent.includes(date));

    return filteredDate;
}

async function listStudentAttendance(studentId, currentTerm, studentInfoColl) {
    const pipeline = [
        {
            $match: {
                $and: [
                    {
                        studentId: parseInt(studentId),
                    },
                    {
                        'terms.term': parseInt(currentTerm),
                    },
                ],
            },
        },
        {
            $project: {
                _id: 0,
                studentName: 1,
                terms: {
                    $filter: {
                        input: '$terms',
                        as: 'item',
                        cond: {
                            $eq: ['$$item.term', parseInt(currentTerm)],
                        },
                    },
                },
            },
        },
    ];

    const aggCursorStudentAttendance = studentInfoColl.aggregate(pipeline);

    const resultStudentAttendance = await aggCursorStudentAttendance.toArray();

    if (resultStudentAttendance.length === 0) {
        return null;
    } else {
        return resultStudentAttendance;
    }
}

async function signUpRole(accessToken, zaloUserId) {
    const attachMessage = {
        text: `Vui lòng chọn vai trò đăng kí:`,
        attachment: {
            type: 'template',
            payload: {
                buttons: [
                    {
                        title: 'Tôi là phụ huynh',
                        payload: '#dkph',
                        type: 'oa.query.show',
                    },
                    {
                        title: 'Con là học sinh',
                        payload: '#dkhs',
                        type: 'oa.query.show',
                    },
                ],
            },
        },
    };

    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);
}

async function signUpAlert(accessToken, zaloUserId, zaloColl) {
    // Check xem tai khoan da dang ki tren he thong chua
    const isRegister = await MongoDB.findOneUser(zaloColl, { zaloUserId: zaloUserId }, { projection: { _id: 0 } });

    // Neu dang ki roi thi hien thong bao cho PHHS
    if (isRegister.userPhone !== null) {
        const { displayName, userPhone, students } = isRegister;

        const studentRegister = students.map((v) => {
            const { zaloStudentId, zaloClassId, aliasName, role } = v;

            const studentName = aliasName.substring(3);

            return `${studentName} có ID là ${zaloStudentId}`;
        });

        const attachMessage = {
            text: `Zalo ${displayName} đã đăng kí số ${userPhone} với học sinh ${studentRegister.join(', ')}. 
Phụ huynh có muốn đăng kí thêm cho học sinh khác không?
(Nhấn nút bên dưới để xác nhận)`,
            attachment: {
                type: 'template',
                payload: {
                    buttons: [
                        {
                            title: 'Tôi muốn đăng kí thêm cho học sinh khác',
                            payload: '#vtdk',
                            type: 'oa.query.show',
                        },
                    ],
                },
            },
        };

        await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);
    }
    // Neu chua thi hien thong bao chon vai tro dang ki
    else {
        await signUpRole(accessToken, zaloUserId);
    }
}

async function signUp4Parent(accessToken, zaloUserId) {
    const message = `👉 Để xác nhận đăng kí tài khoản trên Zalo này, phụ huynh hãy nhập theo đúng cú pháp sau:
dkph IDHS SĐT PH(Đã đăng kí)
---------------------------------------------
👉 Ví dụ: 
dkph 2005xxx 0912345678
---------------------------------------------
👉 Chú ý: 
- SĐT trong cú pháp phải là SĐT đã được đăng kí với lớp toán.
- Tài khoản không nhất thiết phải được đăng kí bằng SĐT đã tạo tài khoản Zalo.
- Mỗi tài khoản Zalo chỉ được liên kết với 1 SĐT đã đăng kí.`;

    await ZaloAPI.sendMessage(accessToken, zaloUserId, message);
}

async function signUp4Student(accessToken, zaloUserId) {
    const message = `👉 Để xác nhận đăng kí tài khoản trên Zalo này, con hãy nhập theo đúng cú pháp sau:
dkhs IDHS SĐT HS (Đã đăng kí)
---------------------------------------------
👉 Ví dụ: 
dkhs 2005xxx 0912345678
---------------------------------------------
👉 Chú ý: 
- SĐT trong cú pháp phải là SĐT đã được đăng kí với lớp toán.
- Tài khoản không nhất thiết phải được đăng kí bằng SĐT đã tạo tài khoản Zalo.
- Mỗi tài khoản Zalo chỉ được liên kết với 1 SĐT đã đăng kí.`;

    await ZaloAPI.sendMessage(accessToken, zaloUserId, message);
}

async function notifyRegister(accessToken, zaloUserId, zaloColl) {
    const isExist = await MongoDB.findOneUser(zaloColl, { zaloUserId: zaloUserId }, { projection: { _id: 0 } });

    if (isExist === null) {
        const profileDoc = await ZaloAPI.getProfile(accessToken, zaloUserId);

        await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');

        await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');

        await MongoDB.insertOneUser(zaloColl, profileDoc);

        const attachMessage = {
            text: 'Phụ huynh cần đăng kí tài khoản để có thể sử dụng tính năng này.',
            attachment: {
                type: 'template',
                payload: {
                    buttons: [
                        {
                            title: 'Đăng kí tài khoản',
                            payload: '#dktk',
                            type: 'oa.query.show',
                        },
                    ],
                },
            },
        };

        await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

        return studentArr;
    } else {
        let studentArr = [];

        const { userPhone, students } = isExist;

        if (userPhone === null) {
            const attachMessage = {
                text: 'Phụ huynh cần đăng kí tài khoản để có thể sử dụng tính năng này.',
                attachment: {
                    type: 'template',
                    payload: {
                        buttons: [
                            {
                                title: 'Đăng kí tài khoản',
                                payload: '#dktk',
                                type: 'oa.query.show',
                            },
                        ],
                    },
                },
            };

            await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

            return studentArr;
        } else {
            students.forEach((v) => {
                if (!v.zaloClassId.includes('N')) {
                    studentArr.push([v.zaloStudentId, v.zaloClassId, v.role, v.aliasName]);
                }
            });

            if (studentArr.length === 0) {
                const goodByeMessage =
                    'Hiện tại phụ huynh đang không có con học tại trung tâm. Chúc phụ huynh một ngày tốt lành!';

                await ZaloAPI.sendMessage(accessToken, zaloUserId, goodByeMessage);
            }

            return studentArr;
        }
    }
}

async function sendClassInfo(accessToken, zaloUserId, classInfoColl, zaloColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [zaloStudentId, zaloClassId, alisaName, role] = zaloStudentInfo[i];

        const classInfo = await MongoDB.findOneUser(
            classInfoColl,
            { classId: zaloClassId },
            { projection: { _id: 0 } }
        );

        const { className, room, currentTerm, totalDate, tuition, startTerm, endTerm, assistants, subjects } =
            classInfo;

        const assistantInfo = assistants
            .map((v) => {
                const { taName, taPhone, taZaloId } = v;

                return `Trợ giảng: ${taName}\nĐiện thoại: ${taPhone}`;
            })
            .join(`\n`);

        const subjectInfo = subjects
            .map((v, i) => {
                const { name, teacher, day, start, end, absent } = v;

                return `${i + 1}) ${name}: ${teacher}\n- ${day}: ${start}-${end}`;
            })
            .join(`\n`);

        const message = `Câu lạc bộ Toán Ánh Sáng xin gửi thông tin lớp ${className} như sau:
------------------------------   
Phòng học: ${room}
------------------------------
${assistants.length ? assistantInfo : `Trợ giảng:\nĐiện thoại:`}
------------------------------
Giáo viên giảng dạy
${subjectInfo}
------------------------------
Đợt hiện tại: ${currentTerm}
Tổng số buổi: ${totalDate} buổi
Bắt đầu đợt: ${startTerm === null ? '' : startTerm}
Kết thúc đợt: ${endTerm === null ? '' : endTerm}
------------------------------
Học phí mỗi buổi: ${tuition}`;

        await ZaloAPI.sendMessage(accessToken, zaloUserId, message);
    }
}

async function sendAssistantInfo(accessToken, zaloUserId, zaloColl, classInfoColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [studentId, classId, role, aliasName] = zaloStudentInfo[i];

        const studentName = aliasName.slice(3);

        const { currentTerm, className, assistants } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            {
                projection: {
                    _id: 0,
                    currentTerm: 1,
                    className: 1,
                    assistants: 1,
                },
            }
        );

        if (assistants.length === 0) {
            const failContent = `Hiện tại chưa có thông tin trợ giảng của con ${studentName} ${studentId} ở lớp ${className} ạ.`;

            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);
        } else {
            const { taName, taPhone } = assistants[0];

            const successContent = `Lớp toán xin gửi đến ${role.toLowerCase()} ${studentName} ở lớp ${className} số điện thoại chị trợ giảng ${taName} là ${taPhone}.\n\nLớp toán có chức năng tự động chuyển tiếp tin nhắn đến từng trợ giảng quản lí lớp nên tin nhắn sẽ luôn được trả lời trong thời gian sớm nhất. ${role} chỉ nên liên hệ trợ giảng trong trường hợp muốn gọi trực tiếp ạ!`;

            const attachMessage = {
                text: successContent,
                attachment: {
                    type: 'template',
                    payload: {
                        buttons: [
                            {
                                title: `Nhắn tin đến trợ giảng ${taName}`,
                                type: 'oa.open.sms',
                                payload: {
                                    content: `Chào ${taName}, tôi là ${role.toLowerCase()} ${studentName} ở lớp ${className}`,
                                    phone_code: taPhone,
                                },
                            },
                            {
                                title: `Gọi điện đến trợ giảng ${taName}`,
                                type: 'oa.open.phone',
                                payload: {
                                    phone_code: taPhone,
                                },
                            },
                        ],
                    },
                },
            };

            await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);
        }
    }
}

async function sendAttendanceInfo(accessToken, zaloUserId, zaloColl, classInfoColl, studentInfoColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [studentId, classId, role, aliasName] = zaloStudentInfo[i];

        const studentName = aliasName.slice(3);

        const { currentTerm, className } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            { projection: { _id: 0, currentTerm: 1, className: 1 } }
        );

        const studentTermInfo = await listStudentAttendance(studentId, currentTerm, studentInfoColl);

        if (studentTermInfo === null) {
            const failContent = `Dữ liệu điểm danh đợt ${currentTerm} của học sinh ${studentName} ${studentId} lớp ${className} chưa có trên cơ sở dữ liệu. ${role} vui lòng liên hệ với trợ giảng để được hỗ trợ.`;

            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

            continue;
        }

        const { terms } = studentTermInfo[0];

        const {
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
        } = terms[0];

        const attendanceInfo = attendances.map((v) => {
            const { no, newDate, teacher } = v;

            const beautifyDate = formatDate(newDate);

            return `- ${no}: ${teacher} - ${beautifyDate}`;
        });

        const absenceInfo = absences.map((v) => {
            const { no, newDate, teacher } = v;

            const beautifyDate = formatDate(newDate);

            return `- ${no}: ${teacher} - ${beautifyDate}`;
        });

        const message = `Câu lạc bộ Toán Ánh Sáng xin gửi đến ${role.toLowerCase()} ${studentName} ${studentId} lớp ${className} kết quả chuyên cần đợt ${term} như sau:
------------------------
Tổng số buổi đợt ${term}: ${total} buổi
------------------------
Số buổi đã học: ${study} buổi${attendanceInfo.length ? `\n${attendanceInfo.join(`\n`)}` : ''}
------------------------
Số buổi đã nghỉ: ${absent} buổi${absenceInfo.length ? `\n${absenceInfo.join(`\n`)}` : ''}`;

        await ZaloAPI.sendMessage(accessToken, zaloUserId, message);
    }
}

async function sendSyntaxPayment(accessToken, zaloUserId, zaloColl, classInfoColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [studentId, classId, role, alisaName] = zaloStudentInfo[i];

        const studentName = alisaName.substring(3);

        const { currentTerm, className } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            { projection: { _id: 0, currentTerm: 1, className: 1 } }
        );

        const syntaxPayment = `${removeVietNam(studentName)} ${studentId} HPD${currentTerm}`;

        await ZaloAPI.sendMessage(accessToken, zaloUserId, syntaxPayment);
    }
}

async function sendPaymentTypeInfo(accessToken, zaloUserId, zaloColl, classInfoColl, studentInfoColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [studentId, classId, role, aliasName] = zaloStudentInfo[i];
        const studentName = aliasName.slice(3);

        const { currentTerm, className } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            { projection: { _id: 0, currentTerm: 1, className: 1 } }
        );

        const studentTermInfo = await listStudentAttendance(studentId, currentTerm, studentInfoColl);
        const { terms } = studentTermInfo[0];
        const { billing, payment } = terms[0];

        // Truong hop phu huynh chua chuyen khoan
        if (payment !== null || payment < billing || billing.includes('Thừa') || billing.includes('Đã nộp đủ')) {
            const syntaxPayment = `${removeVietNam(studentName)} ${studentId} HPD${currentTerm}`;

            const attachMessage = {
                text: `Phụ huynh có 3 hình thức nộp học phí đợt ${currentTerm} cho học sinh ${studentName} ${studentId} lớp ${className} bao gồm:
-------
1) Học sinh nộp tiền mặt trực tiếp tại lớp toán cho trợ giảng và nhận biên lai về.

2) Phụ huynh chuyển khoản vào tài khoản Đặng Thị Hường – ngân hàng VietinBank, số: 107004444793. Trong nội dung chuyển khoản cần phải ghi đúng nội dung sau để hệ thống cập nhật tự động:
${syntaxPayment}

3) Phụ huynh quét mã QR code phía bên dưới để chuyển khoản.
-------
* Lưu ý: 
- Sau khi chuyển khoản thành công, phụ huynh chụp màn hình ảnh biên lai chuyển khoản vào lại trang Zalo OA của lớp toán.
- Nếu phụ huynh đăng kí từ 2 con trở lên vui lòng chuyển khoản riêng cho từng con ạ.`,

                attachment: {
                    type: 'template',
                    payload: {
                        buttons: [
                            {
                                title: 'Sao chép cú pháp chuyển khoản',
                                payload: '#cpck',
                                type: 'oa.query.show',
                            },
                        ],
                    },
                },
            };

            await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

            // Gui ma QR code cho phu huynh
            const qrCodeContent = `Phụ huynh quét mã QR code trên để thanh toán học phí đợt ${currentTerm} cho con ${studentName}.`;
            const qrCodeUrl = createQRCodePayment(billing, syntaxPayment);

            await ZaloAPI.sendImageByUrl(accessToken, zaloUserId, qrCodeContent, qrCodeUrl);
        }
        // Truong hop phu huynh da chuyen khoan
        else {
            const doneContent = `Phụ huynh đã hoàn thành học phí đợt ${currentTerm} cho con ${studentName} rồi ạ!`;

            await ZaloAPI.sendMessage(accessToken, zaloUserId, doneContent);
        }
    }
}

function createQRCodePayment(amount, content) {
    const BANK_ID = 'vietinbank';
    const ACCOUNT_NO = 107004444793;
    const TEMPLATE = 'cJHMwH';
    const ACCOUNT_NAME = encodeURIComponent('Dang Thi Huong');
    const CONTENT = encodeURIComponent(content);

    const qrCodeUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-${TEMPLATE}.png?amount=${amount}&addInfo=${CONTENT}&accountName=${ACCOUNT_NAME}`;
    return qrCodeUrl;
}

async function sendPaymentInfo(accessToken, zaloUserId, zaloColl, classInfoColl, studentInfoColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [studentId, classId, role, aliasName] = zaloStudentInfo[i];

        const studentName = aliasName.slice(3);

        const { currentTerm, className } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            { projection: { _id: 0, currentTerm: 1, className: 1 } }
        );

        const studentTermInfo = await listStudentAttendance(studentId, currentTerm, studentInfoColl);

        if (studentTermInfo === null) {
            const failContent = `Dữ liệu học phí đợt ${currentTerm} của học sinh ${studentName} ${studentId} lớp ${className} chưa có trên cơ sở dữ liệu. ${role} vui lòng liên hệ với trợ giảng để được hỗ trợ.`;

            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

            continue;
        }

        const { terms } = studentTermInfo[0];

        const {
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
        } = terms[0];

        const formatBilling = billing === null ? 'chưa có' : typeof billing === 'string' ? '' : formatCurrency(billing);

        let formatStatus;

        if (typeof billing === 'string' && billing.includes('Đã')) {
            formatStatus = 'Đóng đủ ✅';
        } else {
            if (payment !== null) {
                if (payment > billing) {
                    formatStatus = `thừa ${formatCurrency(payment - billing)} 🔔`;
                } else if (payment < billing) {
                    formatStatus = `thiếu ${formatCurrency(billing - payment)} ❌`;
                } else {
                    formatStatus = 'Đóng đủ ✅';
                }
            } else if (payment === null && typeof billing === 'string' && billing.includes('Thừa')) {
                formatStatus = billing.toLowerCase() + ' 🔔';
            } else {
                formatStatus = 'Chưa đóng ❌';
            }
        }

        const formatRemainder =
            remainder >= 0 ? `thừa ${formatCurrency(remainderBefore)}` : `thiếu ${formatCurrency(remainderBefore)}`;

        const isPaid = payment !== null;

        const isPaidWithScholarship =
            payment === null && typeof billing === 'string' && (billing.includes('Đã') || billing.includes('Thừa'));

        const formatPaid = isPaid
            ? `\n------------------------------------------
Học phí đã nộp: ${formatCurrency(payment)}
Hình thức nộp: ${type}
Ngày nộp: ${paidDate}
${remainder >= 0 ? `Học phí thừa đợt ${term}: ` : `Học phí thiếu ${term}: `}${formatCurrency(remainder)}`
            : '';

        const attachMessageWithButton = {
            text: `Câu lạc bộ Toán Ánh Sáng xin gửi đến ${role.toLowerCase()} ${studentName} ${studentId} lớp ${className} tình trạng học phí đợt ${term} như sau:
------------------------------------------
Bắt đầu đợt: ${formatDate(start)}
Kết thúc đợt: ${formatDate(end)}
------------------------------------------
Buổi học: ${subject}
Tổng số buổi trong đợt: ${total} buổi
Số buổi đã học: ${study} buổi
Số buổi vắng mặt: ${absent} buổi
------------------------------------------
Học phí đợt trước: ${formatRemainder}    
Học phí phải nộp: ${formatBilling}
Tình trạng: ${formatStatus}${formatPaid}
------------------------------------------
Chú ý: số buổi đã học, vắng mặt và học phí còn thừa sẽ tự động được cập nhật sau mỗi buổi học.`,
            attachment: {
                type: 'template',
                payload: {
                    buttons: [
                        {
                            title: 'Thông tin chuyển khoản',
                            payload: '#ttck',
                            type: 'oa.query.show',
                        },
                        {
                            title: 'Cú pháp chuyển khoản',
                            payload: '#cpck',
                            type: 'oa.query.show',
                        },
                    ],
                },
            },
        };

        const simpleMessage = `Câu lạc bộ Toán Ánh Sáng xin gửi đến ${role.toLowerCase()} ${studentName} ${studentId} lớp ${className} tình trạng học phí đợt ${term} như sau:
------------------------------------------
Bắt đầu đợt: ${formatDate(start)}
Kết thúc đợt: ${formatDate(end)}
------------------------------------------
Buổi học: ${subject}
Tổng số buổi trong đợt: ${total} buổi
Số buổi đã học: ${study} buổi
Số buổi vắng mặt: ${absent} buổi
------------------------------------------
Học phí đợt trước: ${formatRemainder}    
Học phí phải nộp: ${formatBilling}
Tình trạng: ${formatStatus}${formatPaid}
------------------------------------------
Chú ý: số buổi đã học, vắng mặt và học phí còn thừa sẽ tự động được cập nhật sau mỗi buổi học.`;
        if (isPaid || isPaidWithScholarship) {
            await ZaloAPI.sendMessage(accessToken, zaloUserId, simpleMessage);
        } else {
            await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessageWithButton);
        }
    }
}

function removeVietNam(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

function formatDate(dateStr) {
    const date = new Date(dateStr);

    return date.toLocaleDateString('vi-VN');
}

function formatDateTime(dateStr) {
    const newDate = new Date(dateStr);

    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    };

    return newDate.toLocaleString('vi-VN', options);
}

function formatCurrency(money) {
    return `${Math.abs(money).toLocaleString('vi-VN')} đ`;
}

function nomarlizeSyntax(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, '');
}

function createDate(dateStr) {
    const [day, month, year] = dateStr.split('/');

    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

async function sendMessage2Assistant(accessToken, classInfoColl, classId, forwardContent) {
    const result = await MongoDB.findOneUser(
        classInfoColl,
        { classId: classId },
        { projection: { _id: 0, assistants: 1 } }
    );

    const isExistAssistant = result !== null;

    if (isExistAssistant) {
        const { assistants } = result;

        for (let i = 0; i < assistants.length; i++) {
            const assistant = assistants[i];
            const { taZaloId } = assistant;

            await ZaloAPI.sendMessage(accessToken, taZaloId, forwardContent);
        }
    }
}

async function sendResponse2Client(accessToken, zaloUserId, messageId, responseContent, action) {
    ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, action);

    await ZaloAPI.sendMessage(accessToken, zaloUserId, responseContent);
}

async function getContentFromMsgId(accessToken, zaloUserId, messageId) {
    const conversation = await ZaloAPI.getConversation(accessToken, zaloUserId);

    if (conversation !== undefined) {
        for (let i = 0; i < conversation.length; i++) {
            const { message_id, message } = conversation[i];

            if (message_id === messageId) {
                return message;
            }
        }
    } else {
        return undefined;
    }
}

async function sendUnfollow2Assistant(accessToken, zaloUserId, zaloColl, classInfoColl) {
    const parentInfo = await MongoDB.findOneUser(zaloColl, { zaloUserId: zaloUserId }, { projection: { _id: 0 } });

    if (parentInfo != null) {
        await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa đăng kí');

        await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');

        MongoDB.updateOneUser(zaloColl, { zaloUserId: `${zaloUserId}` }, { $set: { status: 'unfollow' } });

        const { students, displayName } = parentInfo;

        for (let i = 0; i < students.length; i++) {
            const { zaloStudentId, zaloClassId, aliasName } = students[i];

            const assistantInfo = await MongoDB.findOneUser(
                classInfoColl,
                { classId: zaloClassId },
                { projection: { _id: 0, assistants: 1 } }
            );

            if (assistantInfo !== null) {
                const { assistants } = assistantInfo;

                for (let j = 0; j < assistants.length; j++) {
                    const { taZaloId } = assistants[j];

                    const unfollowContent = `${aliasName} (${zaloStudentId}) với tên Zalo ${displayName} đã hủy theo dõi OA.\n\nTrợ giảng hãy kiểm tra nguyên nhân.`;

                    await ZaloAPI.sendMessage(accessToken, taZaloId, unfollowContent);
                }
            }
        }
    }
}

async function sendReactBack2Parent(accessToken, zaloUserId, messageId, reactIcon, zaloColl) {
    const content = await getContentFromMsgId(accessToken, zaloUserId, messageId);

    if (content !== undefined) {
        const [UID, MID] = content.split('\n\n').at(-1).split(`\n`);

        const zaloId = await findZaloIdFromUserPhone(zaloColl, UID.split(' ')[1]);
        const zaloMessageId = MID.split(' ')[1];

        if (zaloId !== null) {
            await ZaloAPI.sendReaction(accessToken, zaloId, zaloMessageId, reactIcon);
        }
    }
}

async function sendImageBack2Parent(accessToken, imageInfo, zaloColl) {
    // Kiem tra noi dung anh co chua noi dung khong
    const isContainPhoneNum = imageInfo.hasOwnProperty('text');

    // Kiem tra xem co chua so dien thoai khong
    if (isContainPhoneNum) {
        const isValidPhone = imageInfo.text.length === 10;

        if (isValidPhone) {
            const { attachments, text: userPhone } = imageInfo;

            const imageUrl = attachments[0].payload.url;

            const zaloUserId = await findZaloIdFromUserPhone(zaloColl, userPhone);

            await ZaloAPI.sendImageByUrl(accessToken, zaloUserId, '', imageUrl);
        }
    }
}

async function findZaloIdFromUserPhone(zaloColl, userPhone) {
    const result = await MongoDB.findOneUser(
        zaloColl,
        { userPhone: userPhone },
        { projection: { _id: 0, zaloUserId: 1 } }
    );

    if (result !== null) {
        return result.zaloUserId;
    } else {
        return null;
    }
}

async function sendMessageBack2Parent(accessToken, zaloUserId, replyContent, quoteMessageId, zaloColl) {
    const conversation = await ZaloAPI.getConversation(accessToken, zaloUserId);

    for (let i = 0; i < conversation.length; i++) {
        const { message_id, message } = conversation[i];

        if (typeof message === 'string') {
            if (message_id === quoteMessageId) {
                const [UID, MID] = message.split('\n\n').at(-1).split(`\n`);

                const zaloId = await findZaloIdFromUserPhone(zaloColl, UID.split(' ')[1]);
                const zaloMessageId = MID.split(' ')[1];

                await ZaloAPI.sendMessage(accessToken, zaloId, replyContent);

                break; // Chi can tim thay ID tin nhan la huy vong lap luon
            }
        }
    }
}

async function sendImage2Assistant(res, accessToken, classInfoColl, zaloClassId, attachments, forwardImageContent) {
    const imageUrl = attachments[0].payload.url;

    const { assistants } = await MongoDB.findOneUser(
        classInfoColl,
        { classId: zaloClassId },
        { projection: { _id: 0, assistants: 1 } }
    );

    for (let i = 0; i < assistants.length; i++) {
        const assistant = assistants[i];
        const { taZaloId } = assistant;

        await ZaloAPI.sendImageByUrl(accessToken, taZaloId, forwardImageContent, imageUrl);
    }
}

async function forwardImage2Assistant(res, accessToken, zaloUserId, zaloColl, classInfoColl, imageInfo) {
    const isRegister = await MongoDB.findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, students: 1, userPhone: 1, displayName: 1 } }
    );

    // PHHS chua dang ki tai khoan thi khong nhan lai
    if (isRegister.students.length === 0) {
        return;
    }
    // PHHS da dang ki tai khoan thi chuyen tiep toi tro giang
    else {
        const { attachments, text: content, msg_id: messageId } = imageInfo;
        const { userPhone, displayName } = isRegister;

        // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
        for (let i = 0; i < isRegister.students.length; i++) {
            const { zaloStudentId, zaloClassId, aliasName } = isRegister.students[i];

            // chuyen tiep tin nhan den tro giang tuong ung
            const forwardImageContent = `${aliasName} (${displayName}) ${zaloStudentId} lớp ${zaloClassId} đã gửi ảnh${
                content === undefined ? ':' : ` với nội dung: ${content}.`
            }\n\nUID: ${userPhone}`;

            await sendImage2Assistant(res, accessToken, classInfoColl, zaloClassId, attachments, forwardImageContent);
        }
    }
}

async function forwardMessage2Assistant(accessToken, zaloUserId, messageId, zaloColl, classInfoColl, content) {
    const zaloInfo = await MongoDB.findOneUser(zaloColl, { zaloUserId: `${zaloUserId}` }, { projection: { _id: 0 } });

    const isExist = zaloInfo !== null;

    if (isExist) {
        const isRegister = zaloInfo.students.length !== 0;

        // PHHS da dang ki tai khoan
        if (isRegister) {
            const { userPhone, displayName } = zaloInfo;

            const totalStudent = zaloInfo.students.length;

            for (let i = 0; i < totalStudent; i++) {
                // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
                const { zaloStudentId, zaloClassId, aliasName } = zaloInfo.students[i];

                // chuyen tiep tin nhan den tro giang tuong ung
                const forwardContent = `${aliasName} (${displayName}) ${zaloStudentId} lớp ${zaloClassId} đã gửi tin:\n${content}\n\nUID: ${userPhone}\nMID: ${messageId}`;

                await sendMessage2Assistant(accessToken, classInfoColl, zaloClassId, forwardContent);
            }
        }
    }
}

async function isManagerCheck(zaloUserId, classInfoColl) {
    const result = await MongoDB.findOneUser(
        classInfoColl,
        { 'assistants.taZaloId': zaloUserId },
        { projection: { _id: 0 } }
    );

    return result !== null;
}

async function isFollow(zaloUserId, accessToken) {
    const response = await ZaloAPI.getProfile(accessToken, zaloUserId);

    const { status } = response;

    return status === 'follow';
}

async function signUp4Assistant(res, accessToken, taZaloId, classInfoColl, zaloColl, content, messageId) {
    // dktg 2009A0 0915806944 Trọng Linh
    if (content.length < 24) {
        const failContent = `❌ Đăng kí thất bại!\n\nCú pháp không đúng. Trợ giảng hãy nhập lại.`;
        sendResponse2Client(res, accessToken, taZaloId, messageId, failContent, 'sad');
        return;
    }

    const [syntax, classId, taPhone, ...splitName] = content.split(' ');

    const taName = splitName.join(' ').replace(/\s+/g, ' ').trim();

    // check xem da co tro giang tren he thong chua
    const isAssistantExist = await MongoDB.findOneUser(
        classInfoColl,
        { 'assistants.taPhone': taPhone, classId: classId },
        { projection: { _id: 0, assistants: 1 } }
    );

    // Neu chua ton tai thi tao moi

    if (isAssistantExist === null) {
        // Cap nhat tag tren Zalo OA Chat
        await ZaloAPI.tagFollower(accessToken, taZaloId, 'Trợ giảng');
        await ZaloAPI.tagFollower(accessToken, taZaloId, classId);

        await MongoDB.updateOneUser(
            classInfoColl,
            { classId: classId },
            {
                $push: {
                    assistants: {
                        taName: taName,
                        taPhone: taPhone,
                        taZaloId: taZaloId,
                    },
                },
            }
        );

        MongoDB.updateOneUser(zaloColl, { zaloUserId: taZaloId }, { $set: { userPhone: taPhone } });

        const successContent = `✅ Đăng kí thành công cho trợ giảng ${taName} với mã lớp ${classId} và số điện thoại ${taPhone}.`;

        await sendResponse2Client(accessToken, taZaloId, messageId, successContent, 'heart');

        await ZaloAPI.removeFollowerFromTag(accessToken, taZaloId, 'Chưa đăng kí');
    } else {
        // Neu ton tai roi thi:

        const failContent = `❌ Đăng kí thất bại vì trợ giảng ${taName} đã liên kết với mã lớp ${classId}.`;

        await sendResponse2Client(accessToken, taZaloId, messageId, failContent, 'sad');
    }
}

async function deleteAccount(formatContent, accessToken, taZaloId, zaloColl, classInfoColl, messageId, zaloRole) {
    // Check xem co phai do Tro giang nhan khong
    const isManager = await isManagerCheck(taZaloId, classInfoColl);

    // Neu tu tro giang
    if (isManager) {
        const TOTAL_DELETE_SYNTAX = 20;
        const isValidDeleteSyntax = formatContent.length === TOTAL_DELETE_SYNTAX;

        // Neu cu phap dung
        if (isValidDeleteSyntax) {
            const targetStudentId = parseInt(formatContent.substring(3, 10));
            const registerPhone = formatContent.slice(-10);

            // Xoa tag va thong tin tren Zalo OA chat

            const cursor = zaloColl.find(
                {
                    'students.zaloStudentId': targetStudentId,
                    userPhone: registerPhone,
                },
                { projection: { _id: 0 } }
            );

            const documents = await cursor.toArray();
            for (const v of documents) {
                const { zaloUserId, students, displayName } = v;

                // Xoa tag lop hoc
                for (let i = 0; i < students.length; i++) {
                    const removeTag = students[i].zaloClassId;

                    await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, removeTag);
                }

                // Xoa tag Phu huynh/Hoc sinh
                ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, zaloRole);
                ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');

                // Xoa dang ki tai khoan trong Zalo Coll
                MongoDB.updateOneUser(
                    zaloColl,
                    { userPhone: registerPhone, 'students.zaloStudentId': targetStudentId },
                    { $set: { userPhone: null, students: [] } }
                );

                // Gui xac nhan den PHHS
                const sendResponse2DeleteUser = `Trợ giảng đã xoá số điện thoại ${registerPhone} được đăng kí với học sinh ${targetStudentId} trên Zalo ${displayName}.`;

                await ZaloAPI.sendMessage(accessToken, zaloUserId, sendResponse2DeleteUser);

                // Gui xac nhan den Tro giang
                const successContent = `🗑️ Xoá thành công số điện thoại ${registerPhone} được đăng kí với học sinh ${targetStudentId} trên Zalo ${displayName}.`;

                await ZaloAPI.sendReaction(accessToken, taZaloId, messageId, 'heart');

                await ZaloAPI.sendMessage(accessToken, taZaloId, successContent);
            }
        }

        // Neu cu phap sai
        else {
            const failContent = `❌ Đăng kí thất bại!\n\nCú pháp không đúng. Trợ giảng hãy nhập lại.`;

            await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);
        }
    }

    // Neu tu PHHS thi khong co hieu luc
    else {
        const warningMessage = 'Tính năng tính năng này chỉ dành cho tài khoản là trợ giảng của lớp toán.';

        await ZaloAPI.sendMessage(accessToken, taZaloId, warningMessage);
    }
}

async function signUp(accessToken, zaloUserId, zaloColl, classColl, classInfoColl, formatContent, messageId, zaloRole) {
    try {
        // dkph 2004001 0123456789
        const TOTAL_REGISTER_SYNTAX = 21;
        const isValidRegisterSyntax = formatContent.length === TOTAL_REGISTER_SYNTAX;

        if (isValidRegisterSyntax) {
            const targetStudentId = parseInt(formatContent.substring(4, 11));

            const registerPhone = formatContent.slice(-10);

            const isExistInZaloColl = await MongoDB.findOneUser(
                zaloColl,
                { zaloUserId: `${zaloUserId}` },
                { projection: { _id: 0 } }
            );

            // Neu phu huynh chua co du lieu trong Zalo Coll
            // Neu nguoi dung quan tam lan dau
            if (isExistInZaloColl === null) {
                const profileDoc = await ZaloAPI.getProfile(accessToken, zaloUserId);

                await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');

                await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');

                await MongoDB.insertOneUser(zaloColl, profileDoc);
            }

            const { userPhone, students, displayName } = isExistInZaloColl;

            // Kiem tra sdt dang ki co match voi so da ton tai hoac chua ton tai so nao
            const isNotYetRegister = userPhone === null;
            const isMatch = userPhone === registerPhone;
            const isNotMatch = userPhone !== registerPhone;

            // Neu chua tung dang ky bao gio (dang ki lan dau tien cho tai khoan Zalo)
            if (isNotYetRegister) {
                let zaloStudentIdArr = [];
                let zaloClassIdArr = [];
                let aliasNameArr = [];

                // kiem tra tren class collection
                const classUserInfo = await MongoDB.findOneUser(
                    classColl,
                    { studentId: targetStudentId },
                    { projection: { _id: 0 } }
                );

                const isExistStudentId = classUserInfo !== null;

                // Neu ton tai Id tren he thong
                if (isExistStudentId) {
                    const { firstParentPhone, secondParentPhone, studentPhone, fullName, classId } = classUserInfo;

                    let registerPhoneList;

                    if (zaloRole === 'Phụ huynh') {
                        registerPhoneList = [firstParentPhone, secondParentPhone];
                    } else {
                        registerPhoneList = [studentPhone];
                    }

                    const isContainRegisterPhone = registerPhoneList.includes(registerPhone);

                    // Neu sdt nam trong ds dang ki
                    if (isContainRegisterPhone) {
                        const existingUserWithPhone = await MongoDB.findOneUser(
                            zaloColl,
                            { userPhone: registerPhone },
                            { projection: { _id: 1 } }
                        );

                        if (existingUserWithPhone) {
                            const failContent = `⭐ Thông báo!\n\nĐã có 1 tài khoản Zalo khác đăng ký với SĐT này.\n\n${zaloRole} lưu ý:\nMỗi tài khoản Zalo chỉ được liên kết với 1 SĐT đã được đăng kí với trợ giảng trước đó. Nếu có nhu cầu chuyển đổi, ${zaloRole} vui lòng liên hệ với trợ giảng để được hỗ trợ.`;

                            await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'like');

                            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                            return failContent;
                        }

                        // set up role cho zalo user
                        const classInfo = await MongoDB.findOneUser(
                            classInfoColl,
                            { classId: classId },
                            { projection: { _id: 0, className: 1 } }
                        );

                        const isExistClassInfo = classInfo !== null;

                        // Neu ton tai ma lop
                        if (isExistClassInfo) {
                            const { className } = classInfo;

                            const successContent = `✅ Đăng kí thành công!\n\nZalo ${displayName} đã được đăng kí với học sinh ${fullName} có ID là ${targetStudentId} ở lớp ${className}.\n\n${zaloRole} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

                            await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'heart');

                            await ZaloAPI.sendMessage(accessToken, zaloUserId, successContent);

                            const zaloRole2Short = {
                                'Phụ huynh': 'PH',
                                'Học sinh': 'HS',
                            };

                            // them class id moi
                            zaloClassIdArr.push(classId);
                            // them id hs moi
                            zaloStudentIdArr.push(targetStudentId);
                            // them alias moi
                            aliasNameArr.push(`${zaloRole2Short[zaloRole]} ${fullName}`);

                            // Cap nhat tag tren Zalo OA Chat
                            ZaloAPI.tagFollower(accessToken, zaloUserId, zaloRole);
                            ZaloAPI.tagFollower(accessToken, zaloUserId, zaloClassIdArr.at(-1));
                            ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa đăng kí');
                            ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');

                            // cap nhat role cho PHHS trong Zalo Collection
                            MongoDB.updateOneUser(
                                zaloColl,
                                { zaloUserId: `${zaloUserId}` },
                                {
                                    $set: {
                                        userPhone: `${registerPhone}`,
                                    },
                                    $push: {
                                        students: {
                                            zaloStudentId: targetStudentId,
                                            zaloClassId: classId,
                                            aliasName: `${zaloRole2Short[zaloRole]} ${fullName}`,
                                            role: zaloRole,
                                        },
                                    },
                                }
                            );

                            return successContent;
                        }

                        // Neu ma lop chua ton tai
                        else {
                            const failContent = `❌ Đăng kí thất bại!\n\nLớp ${classId} chưa được tạo trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

                            await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

                            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                            return failContent;
                        }
                    }
                    // Neu khong nam trong ds dang ki
                    else {
                        const failContent = `❌ Đăng kí thất bại!\n\nSố điện thoại ${registerPhone} chưa có trong danh sách đã đăng kí. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

                        await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

                        await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                        return failContent;
                    }
                }

                // Neu khong ton tai Id tren he thong
                else {
                    const failContent = `❌ Đăng kí thất bại!\n\nID học sinh ${targetStudentId} không tồn tại trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

                    await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

                    await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                    return failContent;
                }
            }

            // Neu match voi sdt dki (luc dau moi la null, o day la dang ki them cho hs khac)
            else if (isMatch) {
                // Kiem tra sdt trong cu phap da duoc lien ket voi IDHS chua
                let linkStudentIdList = [];
                for (let i = 0; i < students.length; i++) {
                    const { zaloStudentId } = students[i];

                    linkStudentIdList.push(parseInt(zaloStudentId));
                }

                const isLinked = linkStudentIdList.includes(targetStudentId);

                // Neu da duoc lien ket
                if (isLinked) {
                    const failContent = `⭐ Thông báo!\n\nSĐT ${registerPhone} đã được đăng kí với ID học sinh ${targetStudentId}. Phụ huynh không cần phải đăng kí lại nữa ạ.\n\n${zaloRole} lưu ý:\nMỗi tài khoản Zalo chỉ được liên kết với 1 SĐT đã được đăng kí với trợ giảng trước đó. Nếu có nhu cầu chuyển đổi, ${zaloRole} vui lòng liên hệ với trợ giảng để được hỗ trợ.`;

                    await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'like');

                    await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                    return failContent;
                }

                // Neu sdt chua duoc lien ket voi hoc sinh nay
                else {
                    let zaloStudentIdArr = [];
                    let zaloClassIdArr = [];
                    let aliasNameArr = [];

                    // Neu sdt da dang ki voi 1 hoc sinh khac
                    if (students.length > 0) {
                        students.forEach((v) => {
                            const { zaloStudentId, zaloClassId, aliasName } = v;
                            zaloStudentIdArr.push(zaloStudentId);
                            zaloClassIdArr.push(zaloClassId);
                            aliasNameArr.push(aliasName);
                        });
                    }

                    // kiem tra tren class collection
                    const classUserInfo = await MongoDB.findOneUser(
                        classColl,
                        { studentId: targetStudentId },
                        { projection: { _id: 0 } }
                    );

                    const isExistStudentId = classUserInfo !== null;

                    // Neu ton tai Id tren he thong
                    if (isExistStudentId) {
                        const { firstParentPhone, secondParentPhone, studentPhone, fullName, classId } = classUserInfo;

                        let registerPhoneList;

                        if (zaloRole === 'Phụ huynh') {
                            registerPhoneList = [firstParentPhone, secondParentPhone];
                        } else {
                            registerPhoneList = [studentPhone];
                        }

                        const isContainRegisterPhone = registerPhoneList.includes(registerPhone);

                        // Neu sdt nam trong ds dang ki
                        if (isContainRegisterPhone) {
                            // set up role cho zalo user
                            const classInfo = await MongoDB.findOneUser(
                                classInfoColl,
                                { classId: classId },
                                { projection: { _id: 0, className: 1 } }
                            );

                            const isExistClassInfo = classInfo !== null;

                            // Neu ton tai ma lop
                            if (isExistClassInfo) {
                                const { className } = classInfo;

                                const successContent = `✅ Đăng kí thành công!\n\nZalo ${displayName} đã được đăng kí với học sinh ${fullName} có ID là ${targetStudentId} ở lớp ${className}.\n\n${zaloRole} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

                                await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'heart');

                                await ZaloAPI.sendMessage(accessToken, zaloUserId, successContent);

                                const zaloRole2Short = {
                                    'Phụ huynh': 'PH',
                                    'Học sinh': 'HS',
                                };

                                // them class id moi
                                zaloClassIdArr.push(classId);
                                // them id hs moi
                                zaloStudentIdArr.push(targetStudentId);
                                // them alias moi
                                aliasNameArr.push(`${zaloRole2Short[zaloRole]} ${fullName}`);

                                // Cap nhat tag tren Zalo OA Chat
                                ZaloAPI.tagFollower(accessToken, zaloUserId, zaloRole);
                                ZaloAPI.tagFollower(accessToken, zaloUserId, zaloClassIdArr.at(-1));
                                ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa đăng kí');
                                ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');

                                // cap nhat role cho PHHS trong Zalo Collection
                                MongoDB.updateOneUser(
                                    zaloColl,
                                    { zaloUserId: `${zaloUserId}` },
                                    {
                                        $set: {
                                            userPhone: `${registerPhone}`,
                                        },
                                        $push: {
                                            students: {
                                                zaloStudentId: targetStudentId,
                                                zaloClassId: classId,
                                                aliasName: `${zaloRole2Short[zaloRole]} ${fullName}`,
                                                role: zaloRole,
                                            },
                                        },
                                    }
                                );

                                return successContent;
                            }

                            // Neu ma lop chua ton tai
                            else {
                                const failContent = `❌ Đăng kí thất bại!\n\nLớp ${classId} chưa được tạo trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

                                await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

                                await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                                return failContent;
                            }
                        }
                        // Neu khong nam trong ds dang ki
                        else {
                            const failContent = `❌ Đăng kí thất bại!\n\nSố điện thoại ${registerPhone} chưa có trong danh sách đã đăng kí. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

                            await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

                            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                            return failContent;
                        }
                    }

                    // Neu khong ton tai Id tren he thong
                    else {
                        const failContent = `❌ Đăng kí thất bại!\n\nID học sinh ${targetStudentId} không tồn tại trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

                        await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

                        await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                        return failContent;
                    }
                }
            }

            // Neu khong match voi sdt dang ki (da co tai khoan khac dang ki Zalo nay roi)
            else if (isNotMatch) {
                const failContent = `⭐ Thông báo!\n\nĐã có 1 SĐT khác đăng kí với Zalo này.\n\n${zaloRole} lưu ý:\nMỗi tài khoản Zalo chỉ được liên kết với 1 SĐT đã được đăng kí với trợ giảng trước đó. Nếu có nhu cầu chuyển đổi, ${zaloRole} vui lòng liên hệ với trợ giảng để được hỗ trợ.`;

                await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'like');

                await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                return failContent;
            }
        }

        // Neu sai cu phap dang ki tai khoan
        else {
            const failContent = `❌ Đăng kí thất bại!\n\nCú pháp không đúng. Mã ID học sinh phải gồm 7 kí tự và số điện thoại gồm 10 số. ${zaloRole} hãy kiểm tra và nhập lại.`;

            await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

            return failContent;
        }
    } catch (error) {
        const failContent = `❌ Đăng kí thất bại!\n\nĐã có lỗi xảy ra. ${zaloRole} hãy liên hệ trợ giảng để được hỗ trợ.`;

        await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

        await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

        return failContent;
    }
}

export {
    sendUnfollow2Assistant,
    nomarlizeSyntax,
    signUp,
    isFollow,
    signUp4Assistant,
    forwardMessage2Assistant,
    isManagerCheck,
    sendMessageBack2Parent,
    sendMessage2Assistant,
    sendReactBack2Parent,
    deleteAccount,
    notifyRegister,
    sendClassInfo,
    createDate,
    formatDate,
    formatDateTime,
    formatCurrency,
    removeVietNam,
    sendSyntaxPayment,
    sendPaymentTypeInfo,
    sendPaymentInfo,
    sendAttendanceInfo,
    signUpAlert,
    signUpRole,
    signUp4Parent,
    signUp4Student,
    forwardImage2Assistant,
    sendImageBack2Parent,
    sendAssistantInfo,
    getStudyDate,
};
