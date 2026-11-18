package com.clinic.security;

import com.clinic.entity.enums.Role;

/**
 * Người đang đăng nhập, lấy từ JWT.
 *
 * @param sub id tài khoản
 * @param role vai trò
 * @param ver phiên bản token (User.tokenVersion lúc cấp); token cũ hơn bị từ chối
 */
public record AuthUser(String sub, Role role, int ver) {}
