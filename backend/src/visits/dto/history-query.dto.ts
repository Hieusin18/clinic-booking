import { IsString } from 'class-validator';

export class HistoryQuery {
  @IsString() patientId: string;
}
