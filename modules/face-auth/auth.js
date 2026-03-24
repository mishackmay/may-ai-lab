const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class FaceAuth {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, '../../data/may-ai.db'));
    }

    async registerUser(username, faceDescriptor) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO users (username, face_descriptor) VALUES (?, ?)',
                [username, JSON.stringify(faceDescriptor)],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, username });
                }
            );
        });
    }

    async verifyUser(faceDescriptor) {  // <-- This must be INSIDE the class
        return new Promise((resolve, reject) => {
            this.db.all('SELECT username, face_descriptor FROM users', [], (err, users) => {
                if (err) {
                    reject(err);
                    return;
                }

                console.log('=== VERIFY DEBUG ===');
                console.log('All users from DB:', users);
                
                const inputDesc = new Float32Array(Object.values(faceDescriptor));

                let bestMatch = null;
                let smallestDistance = Infinity;
                let bestConfidence = 0;

                for (const user of users) {
                    console.log('Processing user:', user);
                    console.log('Username value:', user.username);
                    console.log('Username type:', typeof user.username);
                    
                    const storedDesc = new Float32Array(JSON.parse(user.face_descriptor));
                    const distance = this.euclideanDistance(inputDesc, storedDesc);
                    console.log('Distance for', user.username, ':', distance);

                    if (distance < smallestDistance) {
                        smallestDistance = distance;
                        bestMatch = user.username;
                        bestConfidence = ((1 - distance) * 100).toFixed(2);
                        console.log('New best match:', bestMatch);
                    }
                }

                console.log('Final bestMatch raw:', bestMatch);
                console.log('Final bestMatch type:', typeof bestMatch);
                console.log('Smallest distance:', smallestDistance);

                if (smallestDistance < 0.6) {
                    console.log('MATCH FOUND! Returning:', {
                        username: String(bestMatch),
                        confidence: bestConfidence
                    });
                    
                    resolve({
                        username: String(bestMatch),
                        confidence: bestConfidence
                    });
                } else {
                    console.log('NO MATCH FOUND');
                    resolve({
                        username: null,
                        confidence: 0
                    });
                }
            });
        });
    }

    euclideanDistance(desc1, desc2) {
        let sum = 0;
        for (let i = 0; i < desc1.length; i++) {
            sum += Math.pow(desc1[i] - desc2[i], 2);
        }
        return Math.sqrt(sum);
    }
}

module.exports = FaceAuth;