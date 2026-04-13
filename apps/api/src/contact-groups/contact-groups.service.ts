import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AddContactsToGroupDto } from './dto/add-contacts-to-group.dto';
import type { CreateContactGroupDto } from './dto/create-contact-group.dto';
import * as Papa from 'papaparse';

@Injectable()
export class ContactGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(workspaceId: string, id: string) {
    const group = await this.prisma.contactGroup.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { members: true } } },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  async members(
    workspaceId: string,
    groupId: string,
    opts: { skip?: number; take?: number; search?: string },
  ) {
    const group = await this.prisma.contactGroup.findFirst({
      where: { id: groupId, workspaceId },
    });
    if (!group) throw new NotFoundException('Group not found');

    const where = {
      groupId,
      contact: opts.search
        ? {
            OR: [
              { firstName: { contains: opts.search, mode: 'insensitive' as const } },
              { lastName: { contains: opts.search, mode: 'insensitive' as const } },
              { phone: { contains: opts.search } },
            ],
          }
        : undefined,
    };

    const [members, total] = await Promise.all([
      this.prisma.contactGroupMember.findMany({
        where,
        skip: opts.skip ?? 0,
        take: opts.take ?? 25,
        include: { contact: true },
        orderBy: { contact: { createdAt: 'desc' } },
      }),
      this.prisma.contactGroupMember.count({ where }),
    ]);

    return { items: members.map((m) => m.contact), total };
  }

  async exportCsv(workspaceId: string, groupId: string): Promise<string> {
    const { items } = await this.members(workspaceId, groupId, { take: 100000 });
    return Papa.unparse(
      items.map((c) => ({
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email ?? '',
        isValid: c.isValid,
        isDuplicate: c.isDuplicate,
      })),
    );
  }

  list(workspaceId: string) {
    return this.prisma.contactGroup.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { members: true } } },
    });
  }

  async create(workspaceId: string, dto: CreateContactGroupDto) {
    return this.prisma.contactGroup.create({
      data: { workspaceId, name: dto.name },
    });
  }

  async addContacts(
    workspaceId: string,
    groupId: string,
    dto: AddContactsToGroupDto,
  ) {
    const group = await this.prisma.contactGroup.findFirst({
      where: { id: groupId, workspaceId },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: dto.contactIds }, workspaceId },
    });
    if (contacts.length !== dto.contactIds.length) {
      throw new NotFoundException('One or more contacts not in workspace');
    }

    await this.prisma.contactGroupMember.createMany({
      data: dto.contactIds.map((contactId) => ({ contactId, groupId })),
      skipDuplicates: true,
    });

    return { groupId, added: contacts.length };
  }
}
