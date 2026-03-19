import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '1m', target: 20 },  // Ramp-up to 20 VUs
        { duration: '3m', target: 50 },  // Ramp-up to 50 VUs
        { duration: '5m', target: 50 },  // Steady state
        { duration: '1m', target: 0 },   // Ramp-down
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
        http_req_failed: ['rate<0.01'],    // Error rate less than 1%
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const ASSESSMENT_ID = __ENV.ASSESSMENT_ID; // Must be passed via CLI

export default function () {
    if (!ASSESSMENT_ID) {
        console.error('ASSESSMENT_ID environment variable is REQUIRED. Example: k6 run load_test.js --env ASSESSMENT_ID=... --env BASE_URL=...');
        return;
    }

    // 1. Start Demo/Mock Assessment
    const loginRes = http.post(`${BASE_URL}/api/public/demo`, null);
    check(loginRes, { 'login status is 200': (r) => r.status === 200 });

    const token = loginRes.json('token');
    const params = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };

    // 2. Fetch Assessment Details
    const assessRes = http.get(`${BASE_URL}/api/assessments/${ASSESSMENT_ID}`, params);
    check(assessRes, { 'fetch assessment is 200': (r) => r.status === 200 });

    const questions = assessRes.json('assessment.questions') || [];
    
    // Simulate candidate reading and answering questions
    for (let i = 0; i < Math.min(questions.length, 5); i++) {
        sleep(Math.random() * 2 + 1); // Simulate reading time

        // 3. Periodic Progress Update (every 2-3 questions)
        if (i % 2 === 0) {
            const progressPayload = JSON.stringify({
                answers: [
                    { question_id: questions[i].id, value: "Simulated load test answer" }
                ],
                violations: []
            });
            const progressRes = http.post(`${BASE_URL}/api/assessments/${ASSESSMENT_ID}/progress`, progressPayload, params);
            check(progressRes, { 'progress update is 200': (r) => r.status === 200 });
        }
    }

    // 4. Final Submission
    const submitPayload = JSON.stringify({
        answers: questions.map(q => ({ question_id: q.id, value: "Final load test answer" })),
        violations: [],
        face_snapshots: null
    });
    const submitRes = http.post(`${BASE_URL}/api/assessments/${ASSESSMENT_ID}/submit`, submitPayload, params);
    const success = check(submitRes, { 'submission is 200': (r) => r.status === 200 });
    if (!success) {
        console.error(`Submission failed: status=${submitRes.status} body=${submitRes.body}`);
    }

    sleep(1);
}
