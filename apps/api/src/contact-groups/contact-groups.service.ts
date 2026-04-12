import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AddContactsToGroupDto } from './dto/add-contacts-to-group.dto';
import type { CreateContactGroupDto } from './dto/create-contact-group.dto';

@Injectable()
export class ContactGroupsService {
  constructor(private readonly prisma: PrismaService) {}

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
