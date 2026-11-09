import { Module } from '@nestjs/common';
import { Icd10Controller } from './icd10.controller.js';

@Module({ controllers: [Icd10Controller] })
export class Icd10Module {}
