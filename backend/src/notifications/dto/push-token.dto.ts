import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export class PushTokenDto {
  @IsString()
  @MaxLength(200)
  @Matches(/^Expo(nent)?PushToken\[[^\]]+\]$/, { message: 'Token thông báo không hợp lệ' })
  token: string;
  @IsIn(['ios', 'android']) platform: 'ios' | 'android';
}
