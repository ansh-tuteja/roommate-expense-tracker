const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const {
  connectTestDB,
  clearDatabase,
  disconnectDB,
  createTestUser,
  createTestUsers,
  createTestGroup
} = require('../helpers/testHelper');

describe('Group Management Integration Tests', () => {
  let agent;
  let currentUser;
  let otherUsers;

  beforeAll(async () => {
    await connectTestDB();
  });

  beforeEach(async () => {
    await clearDatabase();
    
    // Create authenticated session
    currentUser = await createTestUser({ username: 'groupowner' });
    otherUsers = await createTestUsers(3);
    
    agent = request.agent(app);
    await agent.post('/login').send({
      login: currentUser.email,
      password: 'Test@123'
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('POST /api/groups - Create Group', () => {
    test('should create a new group successfully', async () => {
      const groupData = {
        groupName: 'Test Group',
        description: 'A test group',
        members: [otherUsers[0]._id.toString(), otherUsers[1]._id.toString()]
      };

      const response = await agent
        .post('/api/groups')
        .send(groupData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.group.groupName).toBe('Test Group');
      expect(response.body.group.members).toHaveLength(3); // creator + 2 members
    });

    test('should fail to create group without authentication', async () => {
      const groupData = {
        groupName: 'Test Group',
        description: 'A test group',
        members: []
      };

      const response = await request(app)
        .post('/api/groups')
        .send(groupData);

      expect(response.status).toBe(302); // Redirect to login
    });

    test('should fail to create group without name', async () => {
      const groupData = {
        description: 'A test group',
        members: []
      };

      const response = await agent
        .post('/api/groups')
        .send(groupData);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/groups - Get User Groups', () => {
    test('should retrieve all groups for the user', async () => {
      // Create groups where user is a member
      await createTestGroup(currentUser._id, [otherUsers[0]._id]);
      await createTestGroup(currentUser._id, [otherUsers[1]._id]);
      await createTestGroup(otherUsers[0]._id, [currentUser._id]); // User is a member but not creator

      const response = await agent.get('/api/groups');

      expect(response.status).toBe(200);
      expect(response.body.groups).toHaveLength(3);
    });

    test('should return empty array when user has no groups', async () => {
      const response = await agent.get('/api/groups');

      expect(response.status).toBe(200);
      expect(response.body.groups).toHaveLength(0);
    });
  });

  describe('GET /api/groups/:id - Get Group Details', () => {
    test('should retrieve group details for member', async () => {
      const group = await createTestGroup(currentUser._id, [otherUsers[0]._id]);

      const response = await agent.get(`/api/groups/${group._id}`);

      expect(response.status).toBe(200);
      expect(response.body.group.groupName).toBe(group.groupName);
      expect(response.body.group.members).toBeDefined();
    });

    test('should fail to retrieve group details for non-member', async () => {
      const group = await createTestGroup(otherUsers[0]._id, [otherUsers[1]._id]);

      const response = await agent.get(`/api/groups/${group._id}`);

      expect(response.status).toBe(403);
    });

    test('should fail with invalid group ID', async () => {
      const response = await agent.get('/api/groups/invalidid123');

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/groups/:id - Update Group', () => {
    test('should update group details by creator', async () => {
      const group = await createTestGroup(currentUser._id, [otherUsers[0]._id]);

      const updateData = {
        groupName: 'Updated Group Name',
        description: 'Updated description'
      };

      const response = await agent
        .put(`/api/groups/${group._id}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.group.groupName).toBe('Updated Group Name');
    });

    test('should fail to update group by non-creator member', async () => {
      const group = await createTestGroup(otherUsers[0]._id, [currentUser._id]);

      const updateData = {
        groupName: 'Updated Group Name'
      };

      const response = await agent
        .put(`/api/groups/${group._id}`)
        .send(updateData);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/groups/:id/members - Add Group Member', () => {
    test('should add new member to group', async () => {
      const group = await createTestGroup(currentUser._id, [otherUsers[0]._id]);

      const response = await agent
        .post(`/api/groups/${group._id}/members`)
        .send({ userId: otherUsers[1]._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.group.members).toHaveLength(3);
    });

    test('should fail to add duplicate member', async () => {
      const group = await createTestGroup(currentUser._id, [otherUsers[0]._id]);

      const response = await agent
        .post(`/api/groups/${group._id}/members`)
        .send({ userId: otherUsers[0]._id.toString() });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/groups/:id/members/:userId - Remove Group Member', () => {
    test('should remove member from group', async () => {
      const group = await createTestGroup(currentUser._id, [otherUsers[0]._id, otherUsers[1]._id]);

      const response = await agent
        .delete(`/api/groups/${group._id}/members/${otherUsers[0]._id}`);

      expect(response.status).toBe(200);
      expect(response.body.group.members).toHaveLength(2);
    });

    test('should fail to remove creator from group', async () => {
      const group = await createTestGroup(currentUser._id, [otherUsers[0]._id]);

      const response = await agent
        .delete(`/api/groups/${group._id}/members/${currentUser._id}`);

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/groups/:id - Delete Group', () => {
    test('should delete group by creator', async () => {
      const group = await createTestGroup(currentUser._id, [otherUsers[0]._id]);

      const response = await agent.delete(`/api/groups/${group._id}`);

      expect(response.status).toBe(200);
    });

    test('should fail to delete group by non-creator', async () => {
      const group = await createTestGroup(otherUsers[0]._id, [currentUser._id]);

      const response = await agent.delete(`/api/groups/${group._id}`);

      expect(response.status).toBe(403);
    });
  });
});
