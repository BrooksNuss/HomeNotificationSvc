import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyWebsocketEventV2, APIGatewayProxyResult, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDB, ScanCommandInput, PutItemCommandInput, DeleteItemCommandInput, UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';
import { HomeWSSendNotificationRequest } from '../models/HomeWSUpdateRequest';
import { HomeWSConnection } from '../models/HomeWSConnection';
import { HomeWSSendNotificationMessage, HomeWSSubscribeMessage } from '../models/HomeWSMessages';
import axios from 'axios';
const dynamo = new DynamoDB({});
const region = 'us-east-1';
const WSApiUrl = process.env.WS_API_URL + '/dev/@connections/';

export const handler: APIGatewayProxyHandler = async (event, context) => {
	console.log('Received event:', JSON.stringify(event, null, 2));
	// console.log('Event type: ', event.requestContext.eventType);

	let res;
	if (event.requestContext.httpMethod) {
		res = await handleHttpEvent(event);
	} else {
		res = await handleWebsocketEvent(event as APIGatewayProxyWebsocketEventV2);
	}

	return res;
};

async function handleHttpEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	if (event.resource === '/sendnotification') {
		// get all connections that have a recipient type matching the one in the body
		const body = JSON.parse(event.body || '') as HomeWSSendNotificationRequest;
		if (body) {
			// get dynamo items
			const params: ScanCommandInput = {
				TableName: 'HomeWSConnections',
				FilterExpression: 'contains(#subscriptions, :subscriptionType)',
				ExpressionAttributeNames: {
					'#subscriptions': 'subscriptions'
				},
				ExpressionAttributeValues: {
					':subscriptionType': { S: body.subscriptionType }
				}
			};
			const queryResult = await dynamo.scan(params);
			const connections = queryResult.Items as unknown as HomeWSConnection[];

			connections.forEach(conn => {
				sendNotificationToConnection(conn, body);
			});
		}
	}
	
	const responseBody = 'testing';
	const statusCode = 200;
	const headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin' : '*'
	};

	return {
		statusCode,
		body: responseBody,
		headers
	};
}

async function handleWebsocketEvent(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResult> {
	let res;
	switch (event.requestContext.eventType) {
		case 'CONNECT': {
			// save connection to db
			const params: PutItemCommandInput = {
				TableName: 'HomeWSConnections',
				Item: {
					connectionId: { S: event.requestContext.connectionId },
					subscriptions: { SS: [] }
				}
			};
			try {
				res = await dynamo.putItem(params);
			} catch(e) {
				console.error('Error saving new connection to DynamoDB', e);
			}
			break;
		}
		case 'DISCONNECT': {
			// remove connection from db
			const params: DeleteItemCommandInput = {
				TableName: 'HomeWSConnections',
				Key: {
					connectionId: { S: event.requestContext.connectionId }
				}
			};
			try {
				res = await dynamo.deleteItem(params);
			} catch(e) {
				console.error('Error deleting connection from DynamoDB', e);
			}
			break;
		}
		case 'MESSAGE': {
			// based on message type, sub to listener, remove listener
			if (!event.body) {
				console.warn('Received client websocket message with empty body', event);
				break;
			}
			const body: HomeWSSubscribeMessage = JSON.parse(event.body);
			const updateExpression = body.value === 'subscribe' ? 'add subscriptions :subs' : 'delete subscriptions :subs';
			const params: UpdateItemCommandInput = {
				TableName: 'HomeWSConnections',
				UpdateExpression: updateExpression,
				Key: {
					connectionId: { S: event.requestContext.connectionId }
				},
				ExpressionAttributeValues: {
					":subs": { "SS": [body.subscriptionType] }
				}
			};
			try {
				res = await dynamo.updateItem(params);
			} catch(e) {
				console.error('Error updating subscriptions', event);
				console.error(e);
			}
			break;
		}
	}

	const body = 'testing';
	const statusCode = 200;
	const headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin' : '*'
	};

	return {
		statusCode,
		body,
		headers
	};
}

async function sendNotificationToConnection(conn: HomeWSConnection, body: HomeWSSendNotificationRequest) {
	const requestBody: HomeWSSendNotificationMessage = { subscriptionType: body.subscriptionType, value: body.value };
	let res;
	try {
		res = await axios.post(WSApiUrl + conn.connectionId, requestBody);
		console.log(res);
	} catch(e) {
		console.error(`Error sending message to connection [${conn.connectionId}]`);
	}
	const responseBody = res ? res.data : '';
	const statusCode = res ? res.status : 500;
	const headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin' : '*'
	};
	
	return {
		statusCode,
		responseBody,
		headers,
	};
}
	// try {
	// 	const id = event.pathParameters?.id || '';
	// 	const fields = event.body ? JSON.parse(event.body) : null;
	// 	const feeder = id ? await getFeeder(id) : null;

	// 	switch (event.resource as FeederApiResources) {
	// 	case '/activate/{id}':
	// 		if (!feeder) {
	// 			throw `Could not find feeder with id [${id}]`;
	// 		}
	// 		console.log('Received activate message for feeder {%s}', id);
	// 		if (feeder.status === 'OFFLINE') {
	// 			throw `Feeder [${id}] is offline`;
	// 		} else {
	// 			try {
	// 				await postSqsMessage({id, type: 'activate'});
	// 				body = 'Success';
	// 			} catch(e) {
	// 				console.error(e);
	// 				body = 'Error posting SQS message: ' + e;
	// 			}
	// 		}
	// 		break;
	// 	case '/list-info':
	// 		console.log('Received get list message');
	// 		body = await getFeederList();
	// 		break;
	// 	case '/skip/{id}':
	// 		if (!feeder) {
	// 			throw `Could not find feeder with id [${id}]`;
	// 		}
	// 		console.log('Received skip message for feeder {%s}', id);
	// 		if (feeder.status === 'OFFLINE') {
	// 			throw `Feeder [${id}] is offline`;
	// 		} else {
	// 			try {
	// 				await postSqsMessage({id, type: 'skip'});
	// 				body = 'Success';
	// 			} catch(e) {
	// 				console.error(e);
	// 				body = 'Error posting SQS message: ' + e;
	// 			}
	// 		}
	// 		break;
	// 	case '/toggle-enabled/{id}':
	// 		if (!feeder) {
	// 			throw `Could not find feeder with id [${id}]`;
	// 		}
	// 		console.log('Received toggle message for feeder {%s}', id);
	// 		try {
	// 			await postSqsMessage({id, type: 'toggle-enabled'});
	// 			body = 'Success';
	// 		} catch(e) {
	// 			console.error(e);
	// 			body = 'Error posting SQS message: ' + e;
	// 		}
	// 		break;
	// 	case '/update/{id}':
	// 		if (!feeder) {
	// 			throw `Could not find feeder with id [${id}]`;
	// 		}
	// 		console.log('Received update message for feeder {%s}', id);
	// 		try {
	// 			await postSqsMessage({id, type: 'update', fields });
	// 			body = 'Success';
	// 		} catch(e) {
	// 			console.error(e);
	// 			body = 'Error posting SQS message: ' + e;
	// 		}
	// 	}
	// } catch (err: any) {
	// 	console.error(err);
	// 	statusCode = 400;
	// 	body = err.message;
	// } finally {
	// 	body = JSON.stringify(body);
	// }


// async function getFeederList(): Promise<FeederInfo[]> {
// 	console.log('Fetching feeder list from DynamoDB');
// 	const params: ScanInput = {
// 		TableName: 'feeders'
// 	};
// 	const queryResult = dynamo.scan(params).promise();
// 	return (await queryResult).Items as FeederInfo[];
// }

// async function getFeeder(id: string): Promise<FeederInfo> {
// 	console.log('Fetching feeder by id: ' + id);
// 	// key type in docs is different from what the sdk expects. type should be GetItemInput
// 	const params = {
// 		TableName: 'feeders',
// 		Key: {id}
// 	};
// 	const queryResult = await dynamo.get(params).promise();
// 	return queryResult.Item as FeederInfo;
// }

// async function postSqsMessage(body: FeederSqsMessage) {
// 	console.log('Posting message to SQS');
// 	const params: SendMessageRequest = {
// 		QueueUrl: feederQueueUrl || '',
// 		MessageBody: JSON.stringify(body)
// 	};
// 	return sqs.sendMessage(params).promise();
// }