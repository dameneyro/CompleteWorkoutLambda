const { Client } = require('pg');
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

const getDbCredentials = async () => {
    const params = { Name: '/Life/LocalDatabase', WithDecryption: true };
    const data = await ssm.getParameter(params).promise();
    return JSON.parse(data.Parameter.Value);
};

const calculateSetGrades = (sets, exerciseMultipliers) => {
    sets.forEach(set => {
        const { weight, reps, rpe, rir, exercise_type_id } = set;

        // Get multipliers for the exercise type
        const { multiplier_min, multiplier_max } = exerciseMultipliers[exercise_type_id] || { multiplier_min: 1, multiplier_max: 1 };
        const multiplier = (multiplier_min + multiplier_max) / 2;

        // Volume Grade
        const volume_grade = (weight * reps) * multiplier;

        // Effort Grade
        const effort_grade = ((rpe / 10) * (1 - (rir / 10))) * multiplier;

        // Overall Grade
        const overall_grade = volume_grade * (1 + (rpe / 10)) * (1 - (rir / 10)) * multiplier;

        // Assign grades to set
        set.volume_grade = volume_grade;
        set.effort_grade = effort_grade;
        set.overall_grade = overall_grade;
    });

    return sets;
};


const calculateSetAverages = (items) => {
    console.log("ITEMS TO AVERAGE (SETS): ", JSON.stringify(items, null, 2));
    
    let total_volume = 0;
    let total_effort = 0;
    let total_overall = 0;
    let item_count = items.length;

    items.forEach((item, index) => {
        console.log(`Processing set item ${index}: `, item);
        const volume = item.volume_grade;
        const effort = item.effort_grade;
        const overall = item.overall_grade;

        if (typeof volume === 'number' && typeof effort === 'number' && typeof overall === 'number') {
            total_volume += volume;
            total_effort += effort;
            total_overall += overall;
        } else {
            console.error(`Invalid data at set item ${index}: `, item);
        }
    });

    console.log("TOTAL VOLUME (SETS): ", total_volume);
    console.log("TOTAL EFFORT (SETS): ", total_effort);
    console.log("TOTAL OVERALL (SETS): ", total_overall);
    console.log("ITEM COUNT (SETS): ", item_count);

    const average_volume = item_count > 0 ? (total_volume / item_count).toFixed(2) : 0;
    const average_effort = item_count > 0 ? (total_effort / item_count).toFixed(2) : 0;
    const average_overall = item_count > 0 ? (total_overall / item_count).toFixed(2) : 0;

    console.log("AVERAGES (SETS): ", average_volume, average_effort, average_overall);

    return {
        average_volume: parseFloat(average_volume),
        average_effort: parseFloat(average_effort),
        average_overall: parseFloat(average_overall)
    };
};

const calculateExerciseAverages = (items) => {
    console.log("ITEMS TO AVERAGE (EXERCISES): ", JSON.stringify(items, null, 2));
    
    let total_volume = 0;
    let total_effort = 0;
    let total_overall = 0;
    let item_count = items.length;

    items.forEach((item, index) => {
        console.log(`Processing exercise item ${index}: `, item);
        const volume = item.average_volume;
        const effort = item.average_effort;
        const overall = item.average_overall;

        if (typeof volume === 'number' && typeof effort === 'number' && typeof overall === 'number') {
            total_volume += volume;
            total_effort += effort;
            total_overall += overall;
        } else {
            console.error(`Invalid data at exercise item ${index}: `, item);
        }
    });

    console.log("TOTAL VOLUME (EXERCISES): ", total_volume);
    console.log("TOTAL EFFORT (EXERCISES): ", total_effort);
    console.log("TOTAL OVERALL (EXERCISES): ", total_overall);
    console.log("ITEM COUNT (EXERCISES): ", item_count);

    const average_volume = item_count > 0 ? (total_volume / item_count).toFixed(2) : 0;
    const average_effort = item_count > 0 ? (total_effort / item_count).toFixed(2) : 0;
    const average_overall = item_count > 0 ? (total_overall / item_count).toFixed(2) : 0;

    console.log("AVERAGES (EXERCISES): ", average_volume, average_effort, average_overall);

    return {
        average_volume: parseFloat(average_volume),
        average_effort: parseFloat(average_effort),
        average_overall: parseFloat(average_overall)
    };
};

const adjustWorkout = (currentWeight, currentReps, minReps, maxReps, goalMinReps, goalMaxReps, rpe, rir) => {
    let newWeight = currentWeight;
    let newMinReps = goalMinReps || minReps;
    let newMaxReps = goalMaxReps || maxReps;

    const averageReps = currentReps; 

    if (averageReps > maxReps) {
        // Increase weight and reset reps range
        newWeight = calculateNewWeight(currentWeight, averageReps - maxReps);
        newMinReps = 8;
        newMaxReps = 12;
    } else if (averageReps < minReps) {
        // Decrease weight
        newWeight = calculateDecreasedWeight(currentWeight);
        newMinReps = Math.max(8, minReps - 2);
        newMaxReps = Math.max(12, maxReps - 2);
    } else {
        // Adjust reps within the goal range
        newMinReps = Math.min(newMinReps + 2, newMaxReps);
        newMaxReps = newMaxReps + 2;
    }

    return {
        newWeight: newWeight.toFixed(2),
        newMinReps,
        newMaxReps
    };
};

const calculateNewWeight = (currentWeight, repsOverGoal) => {
    let weightIncreasePercent = 0;
    if (repsOverGoal >= 1 && repsOverGoal <= 3) {
        weightIncreasePercent = 0.05; // 5% increase
    } else if (repsOverGoal >= 4) {
        weightIncreasePercent = 0.10; // 10% increase
    }
    let newWeight = currentWeight * (1 + weightIncreasePercent);

    // Adjust rounding based on current weight
    if (currentWeight <= 20) {
        newWeight = Math.ceil(newWeight / 2.5) * 2.5; // Round to nearest 2.5 lbs
    } else {
        newWeight = Math.ceil(newWeight / 5) * 5; // Round to nearest 5 lbs
    }
    return newWeight;
};

const calculateDecreasedWeight = (currentWeight) => {
    let newWeight = currentWeight * 0.975; // Decrease by 2.5%
    if (currentWeight <= 20) {
        newWeight = Math.floor(newWeight / 2.5) * 2.5; // Round to nearest 2.5 lbs
    } else {
        newWeight = Math.floor(newWeight / 5) * 5; // Round to nearest 5 lbs
    }
    return newWeight;
};

exports.handler = async (event) => {
    console.log("IN THE LAMBDA WITH EVENT: ", JSON.stringify(event, null, 2));

    let client;
    const workoutId = event.pathParameters["workout-id"];

    try {
        const dbConfig = await getDbCredentials();

        client = new Client({
            host: dbConfig.DB_HOST,
            database: dbConfig.DB_NAME,
            user: dbConfig.DB_USER,
            password: dbConfig.DB_PASSWORD,
            port: dbConfig.DB_PORT
        });

        await client.connect();

        await client.query(`
            UPDATE fitness.completed_workouts
            SET end_time = NOW()
            WHERE completed_workout_id = $1
        `, [workoutId]);

        // Retrieve all sets and their corresponding exercise IDs for the workout
        const setsRes = await client.query(`
            SELECT cs.*, ce.completed_exercise_id, ce.exercise_id, e.exercise_type_id
            FROM fitness.completed_sets cs
            JOIN fitness.completed_exercises ce ON cs.completed_exercise_id = ce.completed_exercise_id
            JOIN fitness.exercises e ON ce.exercise_id = e.exercise_id
            WHERE ce.completed_workout_id = $1
        `, [workoutId]);

        const sets = setsRes.rows;

        // Retrieve exercise type multipliers
        const exerciseTypesRes = await client.query('SELECT * FROM fitness.exercise_types');
        const exerciseTypes = exerciseTypesRes.rows.reduce((acc, type) => {
            acc[type.exercise_type_id] = type;
            return acc;
        }, {});

        // Calculate grades for each set with multipliers
        const gradedSets = calculateSetGrades(sets, exerciseTypes);

        // Save set grades to the database
        for (const set of gradedSets) {
            await client.query('UPDATE fitness.completed_sets SET volume_grade = $1, effort_grade = $2, overall_grade = $3 WHERE completed_set_id = $4', [set.volume_grade, set.effort_grade, set.overall_grade, set.completed_set_id]);
        }

        // Calculate and save averages for each exercise
        const exerciseAveragesMap = new Map();

        const completedExerciseIds = [...new Set(gradedSets.map(set => set.completed_exercise_id))];
        for (const completedExerciseId of completedExerciseIds) {
            const exerciseSets = gradedSets.filter(set => set.completed_exercise_id === completedExerciseId);
            const exerciseAverages = calculateSetAverages(exerciseSets);
            exerciseAveragesMap.set(completedExerciseId, exerciseAverages);

            await client.query('UPDATE fitness.completed_exercises SET average_volume_grade = $1, average_effort_grade = $2, average_overall_grade = $3 WHERE completed_exercise_id = $4', [exerciseAverages.average_volume, exerciseAverages.average_effort, exerciseAverages.average_overall, completedExerciseId]);
        }

        // Calculate and save averages for the workout
        const completedExercises = Array.from(exerciseAveragesMap.values());
        console.log("completed exercises: ", completedExercises);
        const workoutAverages = calculateExerciseAverages(completedExercises);

        await client.query('UPDATE fitness.completed_workouts SET average_volume_grade = $1, average_effort_grade = $2, average_overall_grade = $3 WHERE completed_workout_id = $4', [workoutAverages.average_volume, workoutAverages.average_effort, workoutAverages.average_overall, workoutId]);

        // Adjust workout based on performance
        for (const completedExerciseId of completedExerciseIds) {
            const exerciseRow = sets.find(set => set.completed_exercise_id === completedExerciseId);
            const exerciseId = exerciseRow.exercise_id;

            console.log("ex id: ", exerciseId);
            const exerciseRes = await client.query(`
                SELECT * FROM fitness.workout_exercises 
                WHERE workout_template_id = (SELECT workout_template_id FROM fitness.completed_workouts WHERE completed_workout_id = $1) 
                AND exercise_id = $2
            `, [workoutId, exerciseId]);

            console.log("WORKOUT EXERCISES FOR ADJUSTMENT: ", exerciseId, exerciseRes);
            if (exerciseRes.rows.length > 0) {
                const exercise = exerciseRes.rows[0];

                const {
                    min_reps = 8,
                    max_reps = 12,
                    goal_min_reps = 8,
                    goal_max_reps = 12,
                    exercise_id,
                    goal_weight
                } = exercise;

                // If goal_weight is null, set it to the most recent set weight
                let finalGoalWeight = goal_weight;
                if (!goal_weight) {
                    const recentSet = gradedSets.filter(set => set.completed_exercise_id === completedExerciseId).pop();
                    finalGoalWeight = recentSet.weight;
                }

                const averageReps = gradedSets
                    .filter(set => set.completed_exercise_id === completedExerciseId)
                    .reduce((sum, set) => sum + set.reps, 0) / gradedSets.filter(set => set.completed_exercise_id === completedExerciseId).length;

                // Log values before calling adjustWorkout
                console.log('Calling adjustWorkout with:', {
                    currentWeight: finalGoalWeight,
                    averageReps,
                    minReps: min_reps,
                    maxReps: max_reps,
                    goalMinReps: goal_min_reps,
                    goalMaxReps: goal_max_reps,
                    rpe: exercise.average_effort_grade,
                    rir: exercise.average_rir_grade
                });

                const {
                    newWeight,
                    newMinReps,
                    newMaxReps
                } = adjustWorkout(
                    finalGoalWeight,
                    averageReps,
                    min_reps,
                    max_reps,
                    goal_min_reps,
                    goal_max_reps,
                    exercise.average_effort_grade,
                    exercise.average_rir_grade
                );

                await client.query(`
                    UPDATE fitness.workout_exercises 
                    SET goal_weight = $1, min_reps = $2, max_reps = $3, 
                    goal_min_reps = COALESCE(goal_min_reps, $4), 
                    goal_max_reps = COALESCE(goal_max_reps, $5)
                    WHERE workout_template_id = (SELECT workout_template_id FROM fitness.completed_workouts WHERE completed_workout_id = $6)
                    AND exercise_id = $7
                `, [newWeight, newMinReps, newMaxReps, newMinReps, newMaxReps, workoutId, exercise_id]);
            } else {
                console.error(`No matching workout_exercises entry found for completed_exercise_id: ${completedExerciseId}`);
            }
        }

        console.log('Workout calculations completed successfully.');

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: 'Workout calculations completed successfully.'
            })
        };
    } catch (err) {
        console.error('Error in handler:', err);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: err.message
            }),
        };
    } finally {
        if (client) {
            await client.end();
        }
    }
};