package com.clinic.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** API vẫn gọi được khi tài khoản đang dùng mật khẩu tạm (xem thông tin, đổi mật khẩu, đăng xuất). */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface AllowPendingPassword {}
