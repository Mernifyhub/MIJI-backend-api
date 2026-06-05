// src/modules/admin/dto/markup/update-markup.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateMarkupDto } from './create-markup.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateMarkupDto extends PartialType(CreateMarkupDto) {
  @IsOptional()
  @IsString()
  updatedById?: string;
}