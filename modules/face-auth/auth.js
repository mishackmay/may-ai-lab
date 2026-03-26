class FaceAuth {
    constructor(pool) {
        this.pool = pool;
    }

    async registerUser(username, faceDescriptor) {
        try {
            const result = await this.pool.query(
                'INSERT INTO users (username, face_descriptor) VALUES ($1, $2) RETURNING id',
                [username, JSON.stringify(faceDescriptor)]
            );
            return { id: result.rows[0].id, username };
        } catch (err) {
            throw err;
        }
    }

    async verifyUser(faceDescriptor) {
        try {
            const result = await this.pool.query('SELECT username, face_descriptor FROM users');
            const users = result.rows;

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
                
                return {
                    username: String(bestMatch),
                    confidence: bestConfidence
                };
            } else {
                console.log('NO MATCH FOUND');
                return {
                    username: null,
                    confidence: 0
                };
            }
        } catch (err) {
            throw err;
        }
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