const http = require('http');
const querystring = require('querystring');

// Function to make POST request for login
function login(username, password) {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify({
            'username': username,
            'password': password
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

// Function to get dashboard
function getDashboard(cookie) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/dashboard',
            method: 'GET',
            headers: {
                'Cookie': cookie
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.end();
    });
}

async function testLogin() {
    try {
        console.log('Attempting to login as aman...');
        const loginResponse = await login('aman', '123');
        console.log('Login response status:', loginResponse.statusCode);
        
        // Extract session cookie
        const setCookieHeader = loginResponse.headers['set-cookie'];
        const sessionCookie = setCookieHeader ? setCookieHeader.find(cookie => cookie.startsWith('connect.sid=')) : null;
        
        if (sessionCookie) {
            console.log('Session cookie obtained');
            
            // Access dashboard
            console.log('Accessing dashboard...');
            const dashboardResponse = await getDashboard(sessionCookie);
            console.log('Dashboard response status:', dashboardResponse.statusCode);
            console.log('Check the server logs for debug output!');
        } else {
            console.log('No session cookie found in response');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

testLogin();