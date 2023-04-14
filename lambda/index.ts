import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyWebsocketEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DeleteCommandInput, DynamoDBDocument, PutCommandInput, ScanCommandInput, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { HomeWSSendNotificationRequest } from '../models/HomeWSUpdateRequest';
import { HomeWSConnection } from '../models/HomeWSConnection';
import { HomeWSSendNotificationMessage, HomeWSSubscribeMessage } from '../models/HomeWSMessages';
import axios from 'axios';

const dynamo = new DynamoDB({});
const dynamoClient = DynamoDBDocument.from(dynamo);
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
					':subscriptionType': body.subscriptionType
				}
			};
			const queryResult = await dynamoClient.scan(params);
			console.log('query result');
			console.log(queryResult.Items);
			const connections = queryResult.Items as unknown as HomeWSConnection[];

			console.log('connections');
			console.log(JSON.stringify(connections));
			connections.forEach(conn => {
				console.log(conn.connectionId);
				console.log(conn.subscriptions);
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
			const params: PutCommandInput = {
				TableName: 'HomeWSConnections',
				Item: {
					connectionId: event.requestContext.connectionId,
					subscriptions: []
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
			const params: DeleteCommandInput = {
				TableName: 'HomeWSConnections',
				Key: {
					connectionId: event.requestContext.connectionId
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
			const params: UpdateCommandInput = {
				TableName: 'HomeWSConnections',
				UpdateExpression: updateExpression,
				Key: {
					connectionId: event.requestContext.connectionId
				},
				ExpressionAttributeValues: {
					':subs': [body.subscriptionType]
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
	console.log('sending notifications to connections');
	const requestBody: HomeWSSendNotificationMessage = { subscriptionType: body.subscriptionType, value: body.value };
	console.log('request body');
	console.log(requestBody);
	const wsUrl = WSApiUrl + conn.connectionId;
	console.log('websocket connections url', wsUrl);
	let res;
	try {
		res = await axios.post(wsUrl, requestBody);
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