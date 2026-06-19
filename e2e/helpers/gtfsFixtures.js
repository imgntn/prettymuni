const protobuf = require('protobufjs');

const gtfsRealtimeProto = {
  nested: {
    transit_realtime: {
      nested: {
        FeedMessage: {
          fields: {
            header: { type: 'FeedHeader', id: 1, rule: 'required' },
            entity: { type: 'FeedEntity', id: 2, rule: 'repeated' },
          },
        },
        FeedHeader: {
          fields: {
            gtfs_realtime_version: { type: 'string', id: 1, rule: 'required' },
            timestamp: { type: 'uint64', id: 3 },
          },
        },
        FeedEntity: {
          fields: {
            id: { type: 'string', id: 1, rule: 'required' },
            vehicle: { type: 'VehiclePosition', id: 4 },
          },
        },
        VehiclePosition: {
          fields: {
            trip: { type: 'TripDescriptor', id: 1 },
            vehicle: { type: 'VehicleDescriptor', id: 8 },
            position: { type: 'Position', id: 2 },
            timestamp: { type: 'uint64', id: 5 },
          },
        },
        TripDescriptor: {
          fields: {
            trip_id: { type: 'string', id: 1 },
            route_id: { type: 'string', id: 5 },
          },
        },
        VehicleDescriptor: {
          fields: {
            id: { type: 'string', id: 1 },
            label: { type: 'string', id: 2 },
          },
        },
        Position: {
          fields: {
            latitude: { type: 'float', id: 1, rule: 'required' },
            longitude: { type: 'float', id: 2, rule: 'required' },
            bearing: { type: 'float', id: 3 },
          },
        },
      },
    },
  },
};

const root = protobuf.Root.fromJSON(gtfsRealtimeProto);
const FeedMessage = root.lookupType('transit_realtime.FeedMessage');

function buildVehiclePositionsFeed(routeId = '14') {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    header: {
      gtfs_realtime_version: '2.0',
      timestamp: now,
    },
    entity: [
      {
        id: 'veh-1001',
        vehicle: {
          trip: {
            trip_id: `${routeId}_trip_1`,
            route_id: routeId,
          },
          vehicle: {
            id: 'veh-1001',
            label: `MUNI-${routeId}`,
          },
          position: {
            latitude: 37.7749,
            longitude: -122.4194,
            bearing: 90,
          },
          timestamp: now,
        },
      },
    ],
  };

  return FeedMessage.encode(payload).finish();
}

module.exports = {
  buildVehiclePositionsFeed,
};
