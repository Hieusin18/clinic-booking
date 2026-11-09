import { IsIn } from 'class-validator';

export class SendForTestsDto {
  @IsIn(['RETURN', 'ONLINE'], { message: 'Chọn cách nhận kết quả' }) mode: 'RETURN' | 'ONLINE';
}
