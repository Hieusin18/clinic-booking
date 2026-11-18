package com.clinic.security;

import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/** Đưa người đang đăng nhập (do {@link AuthInterceptor} gắn vào request) vào tham số {@code @CurrentUser AuthUser}. */
@Component
public class CurrentUserResolver implements HandlerMethodArgumentResolver {
  @Override
  public boolean supportsParameter(MethodParameter p) {
    return p.hasParameterAnnotation(CurrentUser.class) && AuthUser.class.equals(p.getParameterType());
  }

  @Override
  public Object resolveArgument(MethodParameter p, ModelAndViewContainer mav, NativeWebRequest req, WebDataBinderFactory binders) {
    return req.getAttribute(AuthInterceptor.USER_ATTR, RequestAttributes.SCOPE_REQUEST);
  }
}
